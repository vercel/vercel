const entrypoint = process.env.VERCEL_DEV_ENTRYPOINT;
delete process.env.VERCEL_DEV_ENTRYPOINT;

if (!entrypoint) {
  throw new Error('`VERCEL_DEV_ENTRYPOINT` must be defined');
}

import { join } from 'path';
const useRequire = process.env.VERCEL_DEV_IS_ESM !== '1';

import type { Headers } from 'node-fetch';
import type { VercelProxyResponse } from './types';
import { Config } from '@vercel/build-utils';
import { createEdgeEventHandler } from './edge-functions/edge-handler';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createServerlessEventHandler } from './serverless-functions/serverless-handler';
import { getConfig } from '@vercel/static-config';
import { Project } from 'ts-morph';
import listen from 'async-listen';

import {
  checkConfiguredRuntime,
  checkLauncherCompatibility,
  detectServerlessLauncherType,
  isEdgeRuntime,
  logError,
} from './utils';

const parseConfig = (entryPointPath: string) =>
  getConfig(new Project(), entryPointPath);

async function createEventHandler(
  entrypoint: string,
  config: Config,
  options: { shouldAddHelpers: boolean }
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const entrypointPath = join(process.cwd(), entrypoint!);
  const staticConfig = parseConfig(entrypointPath);
  const runtime = checkConfiguredRuntime(staticConfig?.runtime, entrypoint);

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

  const launcherType = detectServerlessLauncherType({ runtime });
  checkLauncherCompatibility(
    entrypoint,
    launcherType,
    Number(process.versions.node.split('.')[0])
  );
  return createServerlessEventHandler(entrypointPath, {
    mode: staticConfig?.supportsResponseStreaming ? 'streaming' : 'buffer',
    shouldAddHelpers: options.shouldAddHelpers,
    useRequire,
    launcherType,
    runtime: config.functions?.[entrypoint]?.runtime,
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

export async function onDevRequest(
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
      if (value !== undefined) {
        res.setHeader(key, value);
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
