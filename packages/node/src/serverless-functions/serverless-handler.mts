import { addHelpers } from './helpers.js';
import { createServer } from 'http';
import { serializeBody } from '../utils.js';
import { streamToBuffer } from '@vercel/build-utils';
import exitHook from 'exit-hook';
import fetch from 'node-fetch';
import { listen } from 'async-listen';
import { isAbsolute } from 'path';
import { pathToFileURL } from 'url';
import type { ServerResponse, IncomingMessage } from 'http';
import type { VercelProxyResponse } from '../types.js';
import type { VercelRequest, VercelResponse } from './helpers.js';

type ServerlessServerOptions = {
  shouldAddHelpers: boolean;
  mode: 'streaming' | 'buffer';
};

type ServerlessFunctionSignature = (
  req: IncomingMessage | VercelRequest,
  res: ServerResponse | VercelResponse
) => void;

const [NODE_MAJOR] = process.versions.node.split('.').map(v => Number(v));

/* https://nextjs.org/docs/app/building-your-application/routing/router-handlers#supported-http-methods */
const HTTP_METHODS = [
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
];

async function createServerlessServer(userCode: ServerlessFunctionSignature) {
  const server = createServer(userCode);
  exitHook(() => server.close());
  return { url: await listen(server) };
}

async function compileUserCode(
  entrypointPath: string,
  options: ServerlessServerOptions
) {
  const id = isAbsolute(entrypointPath)
    ? pathToFileURL(entrypointPath).href
    : entrypointPath;
  let listener = await import(id);

  /**
   * In some cases we might have nested default props due to TS => JS
   */
  for (let i = 0; i < 5; i++) {
    if (listener.default) listener = listener.default;
  }

  if (HTTP_METHODS.some(method => typeof listener[method] === 'function')) {
    if (NODE_MAJOR < 18) {
      throw new Error(
        'Node.js v18 or above is required to use HTTP method exports in your functions.'
      );
    }
    const { getWebExportsHandler } = await import('./helpers-web.js');
    return getWebExportsHandler(listener, HTTP_METHODS);
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (options.shouldAddHelpers) await addHelpers(req, res);
    return listener(req, res);
  };
}

export async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = await compileUserCode(entrypointPath, options);
  const server = await createServerlessServer(userCode);

  return async function (request: IncomingMessage) {
    const url = new URL(request.url ?? '/', server.url);
    // @ts-expect-error
    const response = await fetch(url, {
      compress: false,
      body: await serializeBody(request),
      headers: {
        ...request.headers,
        host: request.headers['x-forwarded-host'],
      },
      method: request.method,
      redirect: 'manual',
    });

    let body;
    if (options.mode === 'streaming') {
      body = response.body;
    } else {
      body = await streamToBuffer(response.body);

      /**
       * `transfer-encoding` is related to streaming chunks.
       * Since we are buffering the response.body, it should be stripped.
       */
      response.headers.delete('transfer-encoding');

      /**
       * Since the entity-length and the transfer-length is different,
       * the content-length should be stripped.
       */
      if (response.headers.has('content-encoding')) {
        response.headers.delete('content-length')
      }
    }

    return {
      status: response.status,
      headers: response.headers,
      body,
      encoding: 'utf8',
    };
  };
}
