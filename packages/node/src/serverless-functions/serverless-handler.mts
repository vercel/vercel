import { addHelpers } from './helpers.js';
import { createServer } from 'http';
import { serializeBody } from '../utils.js';
import { type Dispatcher, Headers, request as undiciRequest } from 'undici';
import { listen } from 'async-listen';
import { isAbsolute } from 'path';
import { pathToFileURL } from 'url';
import { buildToHeaders } from '@edge-runtime/node-utils';
import type { ServerResponse, IncomingMessage } from 'http';
import type { VercelProxyResponse } from '../types.js';
import type { VercelRequest, VercelResponse } from './helpers.js';
import type { Readable } from 'stream';

// @ts-expect-error
const toHeaders = buildToHeaders({ Headers });

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

async function createServerlessServer(
  userCode: ServerlessFunctionSignature
): Promise<{ url: URL; onExit: () => Promise<void> }> {
  const server = createServer(userCode);
  return {
    url: await listen(server),
    onExit: async () => {
      server.close();
    },
  };
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
): Promise<{
  handler: (request: IncomingMessage) => Promise<VercelProxyResponse>;
  onExit: () => Promise<void>;
}> {
  const userCode = await compileUserCode(entrypointPath, options);
  const server = await createServerlessServer(userCode);
  const isStreaming = options.mode === 'streaming';

  const handler = async function (
    request: IncomingMessage
  ): Promise<VercelProxyResponse> {
    const url = new URL(request.url ?? '/', server.url);
    const response = await undiciRequest(url, {
      body: await serializeBody(request),
      headers: {
        ...request.headers,
        host: request.headers['x-forwarded-host'],
      },
      method: (request.method || 'GET') as Dispatcher.HttpMethod,
    });

    let body: Readable | Buffer | null = null;
    let headers = toHeaders(response.headers) as Headers;

    if (isStreaming) {
      body = response.body;
    } else {
      body = Buffer.from(await response.body.arrayBuffer());
    }

    return {
      status: response.statusCode,
      headers,
      body,
      encoding: 'utf8',
    };
  };

  return {
    handler,
    onExit: server.onExit,
  };
}
