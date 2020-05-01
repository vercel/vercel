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
  if (!entrypoint) {
    throw new Error('`NOW_DEV_ENTRYPOINT` must be defined');
  }

  //const shouldAddHelpers = true;

  const entrypointPath = path.join(process.cwd(), entrypoint);
  const handler = await import(entrypointPath);

  /*
  const server = http.createServer((req, res) => {
    Promise.resolve(true).then(() => handler.default(req, res)).catch(err => {
      console.error('Caught error from HTTP handler:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal server error\n');
      }
    });
  });
  */
  const server = createServerWithHelpers(handler.default);

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
