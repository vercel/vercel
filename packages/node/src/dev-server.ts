const entrypoint = process.env.VERCEL_DEV_ENTRYPOINT;
delete process.env.VERCEL_DEV_ENTRYPOINT;

if (!entrypoint) {
  throw new Error('`VERCEL_DEV_ENTRYPOINT` must be defined');
}

delete process.env.TS_NODE_TRANSPILE_ONLY;
delete process.env.TS_NODE_COMPILER_OPTIONS;

import { join } from 'path';
const useRequire = process.env.VERCEL_DEV_IS_ESM !== '1';

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { VercelProxyResponse } from '@vercel/node-bridge/types';
import { Config } from '@vercel/build-utils';
import { getConfig } from '@vercel/static-config';
import { Project } from 'ts-morph';
import { EdgeRuntimes, isEdgeRuntime, logError } from './utils';
import { createEdgeEventHandler } from './edge-functions/edge-handler';
import { createServerlessEventHandler } from './serverless-functions/serverless-handler';

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise(resolve => {
    server.listen(port, host, () => {
      resolve();
    });
  });
}

function parseRuntime(
  entrypoint: string,
  entryPointPath: string
): string | undefined {
  const project = new Project();
  const staticConfig = getConfig(project, entryPointPath);
  const runtime = staticConfig?.runtime;
  if (runtime && !isEdgeRuntime(runtime)) {
    throw new Error(
      `Invalid function runtime "${runtime}" for "${entrypoint}". Valid runtimes are: ${JSON.stringify(
        Object.values(EdgeRuntimes)
      )}. Learn more: https://vercel.link/creating-edge-functions`
    );
  }

  return runtime;
}

async function createEventHandler(
  entrypoint: string,
  config: Config,
  options: { shouldAddHelpers: boolean }
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const entrypointPath = join(process.cwd(), entrypoint!);
  const runtime = parseRuntime(entrypoint, entrypointPath);

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
    shouldAddHelpers: options.shouldAddHelpers,
    useRequire,
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
  await listen(proxyServer, 0, '127.0.0.1');

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
    const result = await handleEvent(req);
    res.statusCode = result.statusCode;
    for (const [key, value] of Object.entries(result.headers)) {
      if (typeof value !== 'undefined') {
        res.setHeader(key, value);
      }
    }
    res.end(Buffer.from(result.body, result.encoding));
  } catch (error: any) {
    res.statusCode = 500;
    res.end(error.stack);
  }
}

main().catch(err => {
  logError(err);
  process.exit(1);
});
