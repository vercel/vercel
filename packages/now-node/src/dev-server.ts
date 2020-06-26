const entrypoint = process.env.VERCEL_DEV_ENTRYPOINT;
delete process.env.VERCEL_DEV_ENTRYPOINT;

const tsconfig = process.env.VERCEL_DEV_TSCONFIG;
delete process.env.VERCEL_DEV_TSCONFIG;

if (!entrypoint) {
  throw new Error('`VERCEL_DEV_ENTRYPOINT` must be defined');
}

import { register } from 'ts-node';

// Use the project's version of TypeScript if available,
// otherwise fall back to using the copy that `@now/node` uses.
let compiler: string;
try {
  compiler = require.resolve('typescript', {
    paths: [process.cwd()],
  });
} catch (e) {
  compiler = 'typescript';
}

const nodeMajor = Number(process.versions.node.split('.')[0]);

let target = 'es2018'; // For Node 10
if (nodeMajor >= 14) {
  target = 'es2020';
} else if (nodeMajor >= 12) {
  target = 'es2019';
}

register({
  compiler,
  compilerOptions: {
    allowJs: true,
    esModuleInterop: true,
    jsx: 'react',
    module: 'commonjs',
    target,
  },
  project: tsconfig || undefined, // Resolve `tsconfig.json` from entrypoint dir
  transpileOnly: true,
});

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { join } from 'path';
import { Readable } from 'stream';
import { Bridge } from './bridge';
import { getNowLauncher } from './launcher';

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise(resolve => {
    server.listen(port, host, () => {
      resolve();
    });
  });
}

let bridge: Bridge | undefined = undefined;

async function main() {
  const config = JSON.parse(process.env.VERCEL_DEV_CONFIG || '{}');
  delete process.env.VERCEL_DEV_CONFIG;

  const buildEnv = JSON.parse(process.env.VERCEL_DEV_BUILD_ENV || '{}');
  delete process.env.VERCEL_DEV_BUILD_ENV;

  const shouldAddHelpers = !(
    config.helpers === false || buildEnv.NODEJS_HELPERS === '0'
  );

  bridge = getNowLauncher({
    entrypointPath: join(process.cwd(), entrypoint!),
    helpersPath: './helpers',
    shouldAddHelpers,
    bridgePath: 'not used',
    sourcemapSupportPath: 'not used',
  })();

  const proxyServer = createServer(onDevRequest);
  await listen(proxyServer, 0, '127.0.0.1');

  const address = proxyServer.address();
  if (typeof process.send === 'function') {
    process.send(address);
  } else {
    console.log('Dev server listening:', address);
  }
}

export function rawBody(readable: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    readable.on('error', reject);
    readable.on('data', chunk => {
      chunks.push(chunk);
      bytes += chunk.length;
    });
    readable.on('end', () => {
      resolve(Buffer.concat(chunks, bytes));
    });
  });
}

export async function onDevRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await rawBody(req);
  const event = {
    Action: 'Invoke',
    body: JSON.stringify({
      method: req.method,
      path: req.url,
      headers: req.headers,
      encoding: 'base64',
      body: body.toString('base64'),
    }),
  };
  if (!bridge) {
    res.statusCode = 500;
    res.end('Bridge is not defined');
    return;
  }
  const result = await bridge.launcher(event, {
    callbackWaitsForEmptyEventLoop: false,
  });
  res.statusCode = result.statusCode;
  for (const [key, value] of Object.entries(result.headers)) {
    if (typeof value !== 'undefined') {
      res.setHeader(key, value);
    }
  }
  res.end(Buffer.from(result.body, result.encoding));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
