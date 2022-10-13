const entrypoint = process.env.VERCEL_DEV_ENTRYPOINT;
delete process.env.VERCEL_DEV_ENTRYPOINT;

const tsconfig = process.env.VERCEL_DEV_TSCONFIG;
delete process.env.VERCEL_DEV_TSCONFIG;

if (!entrypoint) {
  throw new Error('`VERCEL_DEV_ENTRYPOINT` must be defined');
}

import { join } from 'path';
import { register } from 'ts-node';
import { fixConfig } from './typescript';

type TypescriptModule = typeof import('typescript');

let useRequire = false;

if (!process.env.VERCEL_DEV_IS_ESM) {
  const resolveTypescript = (p: string): string => {
    try {
      return require.resolve('typescript', {
        paths: [p],
      });
    } catch (_) {
      return '';
    }
  };

  const requireTypescript = (p: string): TypescriptModule => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(p) as TypescriptModule;
  };

  let ts: TypescriptModule | null = null;

  // Use the project's version of Typescript if available and supports `target`
  let compiler = resolveTypescript(process.cwd());
  if (compiler) {
    ts = requireTypescript(compiler);
  }

  // Otherwise fall back to using the copy that `@vercel/node` uses
  if (!ts) {
    compiler = resolveTypescript(join(__dirname, '..'));
    ts = requireTypescript(compiler);
  }

  let config: any = {};
  if (tsconfig) {
    try {
      config = ts.readConfigFile(tsconfig, ts.sys.readFile).config;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Error while parsing "${tsconfig}"`);
        throw err;
      }
    }
  }

  fixConfigDev(config);

  register({
    compiler,
    compilerOptions: config.compilerOptions,
    transpileOnly: true,
  });

  useRequire = true;
}

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { VercelProxyResponse } from '@vercel/node-bridge/types';
import { Config } from '@vercel/build-utils';
import { getConfig } from '@vercel/static-config';
import { Project } from 'ts-morph';
import { logError } from './utils';
import { createEdgeEventHandler } from './edge-functions/edge-handler';
import { createServerlessEventHandler } from './serverless-functions/serverless-handler';

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise(resolve => {
    server.listen(port, host, () => {
      resolve();
    });
  });
}

const validRuntimes = ['experimental-edge'];
function parseRuntime(
  entrypoint: string,
  entryPointPath: string
): string | undefined {
  const project = new Project();
  const staticConfig = getConfig(project, entryPointPath);
  const runtime = staticConfig?.runtime;
  if (runtime && !validRuntimes.includes(runtime)) {
    throw new Error(
      `Invalid function runtime "${runtime}" for "${entrypoint}". Valid runtimes are: ${JSON.stringify(
        validRuntimes
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
  // `export const config = { runtime: 'experimental-edge' }`
  if (config.middleware === true || runtime === 'experimental-edge') {
    return createEdgeEventHandler(
      entrypointPath,
      entrypoint,
      config.middleware || false
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
  } catch (error) {
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
  } catch (error) {
    res.statusCode = 500;
    res.end(error.stack);
  }
}

export function fixConfigDev(config: { compilerOptions: any }): void {
  const nodeVersionMajor = Number(process.versions.node.split('.')[0]);
  fixConfig(config, nodeVersionMajor);

  // In prod, `.ts` inputs use TypeScript and
  // `.js` inputs use Babel to convert ESM to CJS.
  // In dev, both `.ts` and `.js` inputs use ts-node
  // without Babel so we must enable `allowJs`.
  config.compilerOptions.allowJs = true;

  // In prod, we emit outputs to the filesystem.
  // In dev, we don't emit because we use ts-node.
  config.compilerOptions.noEmit = true;
}

main().catch(err => {
  logError(err);
  process.exit(1);
});
