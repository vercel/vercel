import { register } from 'ts-node';

// Use the project's version of TypeScript if available,
// otherwise fall back to using the copy that `@now/node` uses.
let compiler: string;
try {
  compiler = require.resolve('typescript', {
    paths: [process.cwd(), __dirname],
  });
} catch (e) {
  compiler = 'typescript';
}

register({
  compiler,
  compilerOptions: {
    allowJs: true,
    esModuleInterop: true,
    jsx: 'react',
  },
  transpileOnly: true,
});

import http from 'http';
import path from 'path';
import { createServerWithHelpers } from './helpers';

function listen(
  server: http.Server,
  port: number,
  host: string
): Promise<void> {
  return new Promise(resolve => {
    server.listen(port, host, () => {
      resolve();
    });
  });
}

async function main() {
  const entrypoint = process.env.NOW_DEV_ENTRYPOINT;
  delete process.env.NOW_DEV_ENTRYPOINT;

  if (!entrypoint) {
    throw new Error('`NOW_DEV_ENTRYPOINT` must be defined');
  }

  const config = JSON.parse(process.env.NOW_DEV_CONFIG || '{}');
  delete process.env.NOW_DEV_CONFIG;

  const shouldAddHelpers = config.helpers !== false;

  const entrypointPath = path.join(process.cwd(), entrypoint);
  const handler = await import(entrypointPath);

  const server = shouldAddHelpers
    ? createServerWithHelpers(handler.default)
    : http.createServer(handler.default);

  await listen(server, 0, '127.0.0.1');

  const address = server.address();
  if (typeof process.send === 'function') {
    process.send(address);
  } else {
    console.log('Dev server listening:', address);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
