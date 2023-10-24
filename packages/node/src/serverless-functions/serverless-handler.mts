import { addHelpers } from './helpers.js';
import { createServer } from 'http';
import { serializeBody } from '../utils.js';
import exitHook from 'exit-hook';
import { Headers, request as undiciRequest } from 'undici';
import { listen } from 'async-listen';
import { isAbsolute } from 'path';
import { pathToFileURL } from 'url';
import zlib from 'zlib';
import type { ServerResponse, IncomingMessage } from 'http';
import type { VercelProxyResponse } from '../types.js';
import type { VercelRequest, VercelResponse } from './helpers.js';
import type { Readable } from 'stream';

type ServerlessServerOptions = {
  shouldAddHelpers: boolean;
  mode: 'streaming' | 'buffer';
};

type ServerlessFunctionSignature = (
  req: IncomingMessage | VercelRequest,
  res: ServerResponse | VercelResponse
) => void;

const [NODE_MAJOR] = process.versions.node.split('.').map(v => Number(v));

/* https://nextjs.org/docs/app/building-your-application/routing/router-handlers#supported-http-methods */
const HTTP_METHODS = [
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
];

function compress(body: Buffer, encoding: string): Buffer {
  switch (encoding) {
    case 'br':
      return zlib.brotliCompressSync(body, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 0,
        },
      });
    case 'gzip':
      return zlib.gzipSync(body, {
        level: zlib.constants.Z_BEST_SPEED,
      });
    case 'deflate':
      return zlib.deflateSync(body, {
        level: zlib.constants.Z_BEST_SPEED,
      });
    default:
      throw new Error(`encoding '${encoding}' not supported`);
  }
}

async function createServerlessServer(userCode: ServerlessFunctionSignature) {
  const server = createServer(userCode);
  exitHook(() => server.close());
  return { url: await listen(server) };
}

async function compileUserCode(
  entrypointPath: string,
  options: ServerlessServerOptions
) {
  const id = isAbsolute(entrypointPath)
    ? pathToFileURL(entrypointPath).href
    : entrypointPath;
  let listener = await import(id);

  /**
   * In some cases we might have nested default props due to TS => JS
   */
  for (let i = 0; i < 5; i++) {
    if (listener.default) listener = listener.default;
  }

  if (HTTP_METHODS.some(method => typeof listener[method] === 'function')) {
    if (NODE_MAJOR < 18) {
      throw new Error(
        'Node.js v18 or above is required to use HTTP method exports in your functions.'
      );
    }
    const { getWebExportsHandler } = await import('./helpers-web.js');
    return getWebExportsHandler(listener, HTTP_METHODS);
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (options.shouldAddHelpers) await addHelpers(req, res);
    return listener(req, res);
  };
}

export async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = await compileUserCode(entrypointPath, options);
  const server = await createServerlessServer(userCode);
  const isStreaming = options.mode === 'streaming';

  return async function (request: IncomingMessage) {
    const url = new URL(request.url ?? '/', server.url);
    const response = await undiciRequest(url, {
      body: await serializeBody(request),
      compress: !isStreaming,
      headers: {
        ...request.headers,
        host: request.headers['x-forwarded-host'],
      },
      // @ts-expect-error Default to 'GET', and undici types use a strict method check which is technically incorrect too
      method: request.method || 'GET',
      redirect: 'manual',
    });

    let body: Readable | Buffer | null = null;
    // @ts-expect-error https://github.com/nodejs/undici/pull/2373
    let headers = new Headers(response.headers);

    if (isStreaming) {
      body = response.body;
    } else {
      body = Buffer.from(await response.body.arrayBuffer());

      const contentEncoding = headers.get('content-encoding');
      if (contentEncoding && typeof contentEncoding === 'string') {
        body = compress(body, contentEncoding);
        const clonedHeaders = [];
        for (const [key, value] of headers) {
          if (key !== 'transfer-encoding') {
            // transfer-encoding is only for streaming response
            clonedHeaders.push([key, value]);
          }
        }
        clonedHeaders.push(['content-length', String(Buffer.byteLength(body))]);
        headers = new Headers(clonedHeaders);
      }
    }

    return {
      status: response.statusCode,
      headers,
      body,
      encoding: 'utf8',
    };
  };
}
