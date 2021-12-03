import util from 'util';
import { extname, join, basename } from 'path';
import * as esbuild from 'esbuild';
import { promises as fsp } from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import libGlob from 'glob';
import Proxy from 'http-proxy';
import { updateFunctionsManifest } from '@vercel/build-utils';

import { run } from './websandbox';
import type { FetchEventResult } from './websandbox/types';

import { ParsedUrlQuery, stringify as stringifyQs } from 'querystring';
import {
  format as formatUrl,
  parse as parseUrl,
  UrlWithParsedQuery,
} from 'url';
import { toNodeHeaders } from './websandbox/utils';

const glob = util.promisify(libGlob);
const SUPPORTED_EXTENSIONS = ['.js', '.ts'];

// File name of the `entries.js` file that gets copied into the
// project directory. Use a name that is unlikely to conflict.
const TMP_ENTRIES_NAME = '.output/inputs/middleware/___vc_entries.js';
const TMP_MIDDLEWARE_BUNDLE = '.output/inputs/middleware/_temp_middleware.js';

async function getMiddlewareFile(workingDirectory: string) {
  // Only the root-level `_middleware.*` files are considered.
  // For more granular routing, the Project's Framework (i.e. Next.js)
  // middleware support should be used.
  const middlewareFiles = await glob(join(workingDirectory, '_middleware.*'));

  if (middlewareFiles.length === 0) {
    // No middleware file at the root of the project, so bail...
    return;
  }

  if (middlewareFiles.length > 1) {
    throw new Error(
      `Only one middleware file is allowed. Found: ${middlewareFiles.join(
        ', '
      )}`
    );
  }

  const ext = extname(middlewareFiles[0]);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  return middlewareFiles[0];
}

export async function build({ workPath }: { workPath: string }) {
  const entriesPath = join(workPath, TMP_ENTRIES_NAME);
  const transientFilePath = join(workPath, TMP_MIDDLEWARE_BUNDLE);
  const middlewareFile = await getMiddlewareFile(workPath);
  if (!middlewareFile) return;

  console.log('Compiling middleware file: %j', middlewareFile);

  /**
   * Two builds happen here, because esbuild doesn't offer a way to add a banner
   * to individual input files, and the entries wrapper relies on running in
   * non-strict mode to access the ENTRIES global.
   *
   * To work around this, we bundle the middleware directly and add
   * 'use strict'; to make the entire bundle run in strict mode. We then bundle
   * a second time, adding the global ENTRIES wrapper and preserving the
   * 'use strict' for the entire scope of the original bundle.
   */
  try {
    await esbuild.build({
      entryPoints: [middlewareFile],
      bundle: true,
      absWorkingDir: workPath,
      outfile: transientFilePath,
      banner: {
        js: '"use strict";',
      },
      format: 'cjs',
    });
    // Create `_ENTRIES` wrapper
    await fsp.copyFile(join(__dirname, 'entries.js'), entriesPath);
    await esbuild.build({
      entryPoints: [entriesPath],
      bundle: true,
      absWorkingDir: workPath,
      outfile: join(workPath, '.output/server/pages/_middleware.js'),
    });
  } finally {
    await fsp.unlink(transientFilePath);
    await fsp.unlink(entriesPath);
  }

  const fileName = basename(middlewareFile);
  const pages: { [key: string]: any } = {};

  pages[fileName] = {
    runtime: 'web',
    env: [],
    files: ['server/pages/_middleware.js'],
    name: 'pages/_middleware',
    page: '/',
    regexp: '^/.*$',
    sortingIndex: 1,
  };

  await updateFunctionsManifest({ workPath, pages });
}

const stringifyQuery = (req: IncomingMessage, query: ParsedUrlQuery) => {
  const initialQueryValues = Object.values((req as any).__NEXT_INIT_QUERY);

  return stringifyQs(query, undefined, undefined, {
    encodeURIComponent(value: any) {
      if (initialQueryValues.some(val => val === value)) {
        return encodeURIComponent(value);
      }
      return value;
    },
  });
};

// eslint-disable-next-line
async function runMiddlewareCatchAll(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string,
  name: string,
  path: string
) {
  let result: FetchEventResult | null = null;
  const parsedUrl = parseUrl(req.url!, true);
  try {
    result = await runMiddleware({
      request: req,
      response: res,
      name: name,
      path,
      requestId: requestId,
      parsedUrl,
      parsed: parseUrl(req.url!, true),
    });
  } catch (err) {
    console.error(err);
    return { finished: true, error: err };
  }

  if (result === null) {
    return { finished: true };
  }

  if (
    !result.response.headers.has('x-middleware-rewrite') &&
    !result.response.headers.has('x-middleware-next') &&
    !result.response.headers.has('Location')
  ) {
    result.response.headers.set('x-middleware-refresh', '1');
  }

  result.response.headers.delete('x-middleware-next');

  for (const [key, value] of Object.entries(
    toNodeHeaders(result.response.headers)
  )) {
    if (key !== 'content-encoding' && value !== undefined) {
      res.setHeader(key, value);
    }
  }

  const preflight =
    req.method === 'HEAD' && req.headers['x-middleware-preflight'];

  if (preflight) {
    res.writeHead(200);
    res.end();
    return {
      finished: true,
    };
  }

  res.statusCode = result.response.status;
  res.statusMessage = result.response.statusText;

  const location = result.response.headers.get('Location');
  if (location) {
    res.statusCode = result.response.status;
    if (res.statusCode === 308) {
      res.setHeader('Refresh', `0;url=${location}`);
    }

    res.end();
    return {
      finished: true,
    };
  }

  if (result.response.headers.has('x-middleware-rewrite')) {
    const rewrite = result.response.headers.get('x-middleware-rewrite')!;
    const rewriteParsed = parseUrl(rewrite, true);
    if (rewriteParsed.protocol) {
      return proxyRequest(req, res, rewriteParsed);
    }

    (req as any)._nextRewroteUrl = rewrite;
    (req as any)._nextDidRewrite = (req as any)._nextRewroteUrl !== req.url;

    return {
      finished: false,
      pathname: rewriteParsed.pathname,
      query: {
        ...parsedUrl.query,
        ...rewriteParsed.query,
      },
    };
  }

  if (result.response.headers.has('x-middleware-refresh')) {
    res.writeHead(result.response.status);

    if (result.response.body instanceof Buffer) {
      res.write(result.response.body);
    } else {
      //@ts-ignore
      for await (const chunk of result.response.body || []) {
        res.write(chunk);
      }
    }
    res.end();
    return {
      finished: true,
    };
  }

  return {
    finished: false,
  };
}

const proxyRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: UrlWithParsedQuery
) => {
  const { query } = parsedUrl;
  delete (parsedUrl as any).query;
  parsedUrl.search = stringifyQuery(req, query);

  const target = formatUrl(parsedUrl);
  const proxy = new Proxy({
    target,
    changeOrigin: true,
    ignorePath: true,
    xfwd: true,
    proxyTimeout: 30_000, // limit proxying to 30 seconds
  });

  await new Promise((proxyResolve, proxyReject) => {
    let finished = false;

    proxy.on('proxyReq', (proxyReq: any) => {
      proxyReq.on('close', () => {
        if (!finished) {
          finished = true;
          proxyResolve(true);
        }
      });
    });
    proxy.on('error', (err: any) => {
      if (!finished) {
        finished = true;
        proxyReject(err);
      }
    });
    proxy.web(req, res);
  });

  return {
    finished: true,
  };
};

async function runMiddleware(params: {
  request: IncomingMessage;
  response: ServerResponse;
  parsedUrl: UrlWithParsedQuery;
  parsed: UrlWithParsedQuery;
  requestId: string;
  name: string;
  path: string;
}): Promise<FetchEventResult | null> {
  const page: { name?: string; params?: { [key: string]: string } } = {};
  let result: FetchEventResult | null = null;

  result = await run({
    name: params.name,
    path: params.path,
    request: {
      headers: params.request.headers,
      method: params.request.method || 'GET',
      url: params.request.url!,
      // url: (params.request as any).__NEXT_INIT_URL,
      page,
    },
  });

  result.waitUntil.catch((error: any) => {
    console.error(`Uncaught: middleware waitUntil errored`, error);
  });

  return result;
}

// Should run the middleware in the `vm` sandbox and return the result
// back to `vercel dev`. If no middleware file exists then this function
// should return `finished: false` (very quickly, since this is being
// invoked for every HTTP request!).
export async function runDevMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  workingDirectory: string
): ReturnType<typeof runMiddlewareCatchAll> {
  const middlewareFile = await getMiddlewareFile(workingDirectory);
  if (!middlewareFile) {
    return {
      finished: false,
    };
  }
  return runMiddlewareCatchAll(
    req,
    res,
    '',
    basename(middlewareFile),
    middlewareFile
  );
}
