const entrypoint = process.env.VERCEL_DEV_ENTRYPOINT;
delete process.env.VERCEL_DEV_ENTRYPOINT;

if (!entrypoint) {
  throw new Error('`VERCEL_DEV_ENTRYPOINT` must be defined');
}

import { join } from 'path';
import type { Headers } from 'node-fetch';
import type { VercelProxyResponse } from './types.js';
import { Config } from '@vercel/build-utils';
import { createEdgeEventHandler } from './edge-functions/edge-handler.mjs';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createServerlessEventHandler } from './serverless-functions/serverless-handler.mjs';
import { isEdgeRuntime, logError, validateConfiguredRuntime } from './utils.js';
import { getConfig } from '@vercel/static-config';
import { Project } from 'ts-morph';
import { listen } from 'async-listen';

const parseConfig = (entryPointPath: string) =>
  getConfig(new Project(), entryPointPath);

async function createEventHandler(
  entrypoint: string,
  config: Config,
  options: { shouldAddHelpers: boolean }
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const entrypointPath = join(process.cwd(), entrypoint!);
  const staticConfig = parseConfig(entrypointPath);

  const runtime = staticConfig?.runtime;
  validateConfiguredRuntime(runtime, entrypoint);

  // `middleware.js`/`middleware.ts` file is always run as
  // an Edge Function, otherwise needs to be opted-in via
  // `export const config = { runtime: 'edge' }`
  if (config.middleware === true || isEdgeRuntime(runtime)) {
    return createEdgeEventHandler(
      entrypointPath,
      entrypoint,
      config.middleware || false,
      config.zeroConfig
    );
  }

  return createServerlessEventHandler(entrypointPath, {
    mode: staticConfig?.supportsResponseStreaming ? 'streaming' : 'buffer',
    shouldAddHelpers: options.shouldAddHelpers,
  });
}

let handleEvent: (request: IncomingMessage) => Promise<VercelProxyResponse>;
let handlerEventError: Error;

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
    handleEvent = await createEventHandler(entrypoint!, config, {
      shouldAddHelpers,
    });
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

  if (!handleEvent) {
    res.statusCode = 500;
    res.end('Bridge is not ready, please try again');
    return;
  }

  try {
    const { headers, body, status } = await handleEvent(req);
    res.statusCode = status;

    for (const [key, value] of headers as unknown as Headers) {
      // node-fetch does not support headers.getSetCookie(), so we need to
      // manually set the raw value which can be an array of strings
      if (value !== undefined) {
        res.setHeader(key, key === 'set-cookie' ? headers.raw()[key] : value);
      }
    }

    if (body instanceof Buffer) {
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
