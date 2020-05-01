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

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { join } from 'path';
import { Readable } from 'stream';
import { Bridge } from './bridge';
import { createServerWithHelpers } from './helpers';

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise(resolve => {
    server.listen(port, host, () => {
      resolve();
    });
  });
}

let bridge = new Bridge();

async function main() {
  const entrypoint = process.env.NOW_DEV_ENTRYPOINT;
  delete process.env.NOW_DEV_ENTRYPOINT;

  if (!entrypoint) {
    throw new Error('`NOW_DEV_ENTRYPOINT` must be defined');
  }

  const config = JSON.parse(process.env.NOW_DEV_CONFIG || '{}');
  delete process.env.NOW_DEV_CONFIG;

  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
  }

  let isServerListening = false;
  const originalListen = Server.prototype.listen;
  Server.prototype.listen = function listen() {
    isServerListening = true;
    console.log('Legacy server listening...');
    bridge.setServer(this);
    Server.prototype.listen = originalListen;
    bridge.listen();
    return this;
  };

  const shouldAddHelpers = !(
    config.helpers === false || process.env.NODEJS_HELPERS === '0'
  );

  try {
    const entrypointPath = join(process.cwd(), entrypoint);
    const { default: listener } = await import(entrypointPath);

    if (typeof listener.listen === 'function') {
      Server.prototype.listen = originalListen;
      const server = listener;
      bridge.setServer(server);
      bridge.listen();
    } else if (typeof listener === 'function') {
      Server.prototype.listen = originalListen;
      let server: Server;
      if (shouldAddHelpers) {
        bridge = new Bridge(undefined, true);
        server = createServerWithHelpers(listener, bridge);
      } else {
        server = createServer(listener);
      }
      bridge.setServer(server);
      bridge.listen();
    } else if (
      typeof listener === 'object' &&
      Object.keys(listener).length === 0
    ) {
      setTimeout(() => {
        if (!isServerListening) {
          console.error(`No exports found in module "${entrypoint}"`);
          console.error('Did you forget to export a function or a server?');
          process.exit(1);
        }
      }, 5000);
    } else {
      console.error(`Invalid export found in module "${entrypoint}".`);
      console.error('The default export must be a function or server.');
    }

    const proxyServer = createServer(onDevRequest);
    await listen(proxyServer, 0, '127.0.0.1');

    const address = proxyServer.address();
    if (typeof process.send === 'function') {
      process.send(address);
    } else {
      console.log('Dev server listening:', address);
    }
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.error(err.message);
      console.error(
        'Did you forget to add it to "dependencies" in `package.json`?'
      );
    } else {
      console.error(err);
    }
    process.exit(1);
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
