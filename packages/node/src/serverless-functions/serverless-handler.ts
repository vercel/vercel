import { IncomingMessage } from 'http';
import { Readable } from 'stream';
import type { Bridge } from '@vercel/node-bridge/bridge';
import { getVercelLauncher } from '@vercel/node-bridge/launcher.js';
import { VercelProxyResponse } from '@vercel/node-bridge/types';

function rawBody(readable: Readable): Promise<Buffer> {
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

export async function createServerlessEventHandler(
  entrypoint: string,
  options: {
    shouldAddHelpers: boolean;
    useRequire: boolean;
  }
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const launcher = getVercelLauncher({
    entrypointPath: entrypoint,
    helpersPath: './helpers.js',
    shouldAddHelpers: options.shouldAddHelpers,
    useRequire: options.useRequire,

    // not used
    bridgePath: '',
    sourcemapSupportPath: '',
  });
  const bridge: Bridge = launcher();

  return async function (request: IncomingMessage) {
    const body = await rawBody(request);
    const event = {
      Action: 'Invoke',
      body: JSON.stringify({
        method: request.method,
        path: request.url,
        headers: request.headers,
        encoding: 'base64',
        body: body.toString('base64'),
      }),
    };

    return bridge.launcher(event, {
      callbackWaitsForEmptyEventLoop: false,
    });
  };
}
