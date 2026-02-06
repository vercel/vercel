const entrypoint = process.env.VERCEL_DEV_ENTRYPOINT;
delete process.env.VERCEL_DEV_ENTRYPOINT;

if (!entrypoint) {
  throw new Error('`VERCEL_DEV_ENTRYPOINT` must be defined');
}

import { join } from 'path';
import type { Headers } from 'undici';
import type { VercelProxyResponse } from './types.js';
import { Config, getLambdaOptionsFromFunction } from '@vercel/build-utils';
import { createEdgeEventHandler } from './edge-functions/edge-handler.mjs';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import {
  createServerlessEventHandler,
  HTTP_METHODS,
} from './serverless-functions/serverless-handler.mjs';
import { isEdgeRuntime, logError, validateConfiguredRuntime } from './utils.js';
import { init, parse as parseEsm } from 'es-module-lexer';
import { parse as parseCjs } from 'cjs-module-lexer';
import { getConfig } from '@vercel/static-config';
import { Project } from 'ts-morph';
import { listen } from 'async-listen';
import { readFile } from 'fs/promises';

const parseConfig = (entryPointPath: string) =>
  getConfig(new Project(), entryPointPath);

async function createEventHandler(
  entrypoint: string,
  config: Config,
  options: { shouldAddHelpers: boolean }
): Promise<{
  handler: (request: IncomingMessage) => Promise<VercelProxyResponse>;
  onExit: (() => Promise<void>) | undefined;
}> {
  const entrypointPath = join(process.cwd(), entrypoint!);
  const staticConfig = parseConfig(entrypointPath);

  const runtime = staticConfig?.runtime;
  validateConfiguredRuntime(runtime, entrypoint);

  const { maxDuration } = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const isMiddleware = config.middleware === true;

  // middleware is edge by default, otherwise respect the runtime
  const useEdgeRuntime = (isMiddleware && !runtime) || isEdgeRuntime(runtime);

  if (useEdgeRuntime) {
    return createEdgeEventHandler(
      entrypointPath,
      entrypoint,
      isMiddleware,
      config.zeroConfig,
      maxDuration
    );
  }

  const content = await readFile(entrypointPath, 'utf8');

  const isStreaming =
    staticConfig?.supportsResponseStreaming ||
    isMiddleware ||
    (await hasWebHandlers(async () => parseCjs(content).exports)) ||
    (await hasWebHandlers(async () =>
      init.then(() => parseEsm(content)[1].map(specifier => specifier.n))
    ));

  return createServerlessEventHandler(entrypointPath, {
    mode: isStreaming ? 'streaming' : 'buffer',
    shouldAddHelpers: isMiddleware ? false : options.shouldAddHelpers,
    maxDuration,
    isMiddleware,
  });
}

async function hasWebHandlers(getExports: () => Promise<string[]>) {
  const exports = await getExports().catch(() => []);
  for (const name of exports) {
    if (HTTP_METHODS.includes(name) || name === 'default' || name === 'fetch') {
      return true;
    }
  }
  return false;
}

let handleEvent: (request: IncomingMessage) => Promise<VercelProxyResponse>;
let handlerEventError: Error;
let onExit: (() => Promise<void>) | undefined;

async function main() {
  const config = JSON.parse(process.env.VERCEL_DEV_CONFIG || '{}');
  delete process.env.VERCEL_DEV_CONFIG;

  const buildEnv = JSON.parse(process.env.VERCEL_DEV_BUILD_ENV || '{}');
  delete process.env.VERCEL_DEV_BUILD_ENV;

  const shouldAddHelpers = !(
    config.helpers === false || buildEnv.NODEJS_HELPERS === '0'
  );

  const proxyServer = createServer(onDevRequest);
  await listen(proxyServer, { host: '127.0.0.1', port: 0 });

  try {
    const result = await createEventHandler(entrypoint!, config, {
      shouldAddHelpers,
    });
    handleEvent = result.handler;
    onExit = result.onExit;
  } catch (error: any) {
    logError(error);
    handlerEventError = error;
  }

  const address = proxyServer.address();
  if (typeof process.send === 'function') {
    process.send(address);
  } else {
    console.log('Dev server listening:', address);
  }
}

async function onDevRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (handlerEventError) {
    // this error state is already logged, but we have to wait until here to exit the process
    // this matches the serverless function bridge launcher's behavior when
    // an error is thrown in the function
    process.exit(1);
  }

  // Check for static files in public directory first
  const publicDir = process.env.VERCEL_DEV_PUBLIC_DIR;
  if (publicDir && req.url) {
    const { join } = await import('path');
    const { existsSync, statSync } = await import('fs');
    const { readFile } = await import('fs/promises');

    const staticPath = join(process.cwd(), publicDir, req.url);

    if (existsSync(staticPath) && statSync(staticPath).isFile()) {
      try {
        const content = await readFile(staticPath);
        const { extname } = await import('path');
        const { contentType } = await import('mime-types');

        const url = new URL(req.url || '/', 'http://localhost');
        const ext = extname(url.pathname);
        const mimeType = contentType(ext) || 'application/octet-stream';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', content.length);
        res.statusCode = 200;
        res.end(content);
        return;
      } catch (error) {
        // If there's an error reading the static file, fall through to the main handler
      }
    }
  }

  if (!handleEvent) {
    res.statusCode = 500;
    res.end('Bridge is not ready, please try again');
    return;
  }

  try {
    const { headers, body, status } = await handleEvent(req);
    res.statusCode = status;

    // Transfer-Encoding is a hop-to-hop header and should not be proxied
    headers.delete('transfer-encoding');

    for (const [key, value] of headers as Headers) {
      if (value !== undefined)
        res.setHeader(
          key,
          key === 'set-cookie' ? headers.getSetCookie() : value
        );
    }

    if (body === null) {
      res.end();
    } else if (body instanceof Buffer) {
      res.end(body);
    } else {
      body.pipe(res);
    }
  } catch (error: any) {
    res.statusCode = 500;
    res.end(error.stack);
  }
}

main().catch(err => {
  logError(err);
  process.exit(1);
});

process.on('message', async m => {
  switch (m) {
    case 'shutdown':
      if (onExit) {
        await onExit();
      }
      process.exit(0);
      break;
    default:
      console.error(`unknown IPC message from parent:`, m);
      break;
  }
});

process.on('SIGTERM', async () => {
  if (onExit) {
    await onExit();
  }
  process.exit(0);
});
