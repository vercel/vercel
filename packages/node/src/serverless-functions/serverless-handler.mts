import { addHelpers } from './helpers.js';
import { createServer } from 'http';
import {
  WAIT_UNTIL_TIMEOUT,
  serializeBody,
  waitUntilWarning,
} from '../utils.js';
import { type Dispatcher, Headers, request as undiciRequest } from 'undici';
import { listen } from 'async-listen';
import { isAbsolute } from 'path';
import { pathToFileURL } from 'url';
import { buildToHeaders } from '@edge-runtime/node-utils';
import { promisify } from 'util';
import type { ServerResponse, IncomingMessage } from 'http';
import type { VercelProxyResponse } from '../types.js';
import type { VercelRequest, VercelResponse } from './helpers.js';
import type { Readable } from 'stream';
import { Awaiter } from '../awaiter.js';
import http, { Server } from 'http';

// @ts-expect-error
const toHeaders = buildToHeaders({ Headers });

type ServerlessServerOptions = {
  shouldAddHelpers: boolean;
  mode: 'streaming' | 'buffer';
  maxDuration?: number;
  isMiddleware?: boolean;
};

type ServerlessFunctionSignature = (
  req: IncomingMessage | VercelRequest,
  res: ServerResponse | VercelResponse
) => void;

/* https://nextjs.org/docs/app/building-your-application/routing/router-handlers#supported-http-methods */
export const HTTP_METHODS = [
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
    url: await listen(server, { host: '127.0.0.1', port: 0 }),
    onExit: promisify(server.close.bind(server)),
  };
}

async function compileUserCode(
  entrypointPath: string,
  awaiter: Awaiter,
  options: ServerlessServerOptions
) {
  const id = isAbsolute(entrypointPath)
    ? pathToFileURL(entrypointPath).href
    : entrypointPath;
  let handler: any;
  let mod: any;

  const originalListen = http.Server.prototype.listen;
  try {
    // @ts-expect-error
    http.Server.prototype.listen = function (this: Server) {
      // https://github.com/nodejs/node/blob/af77e4bf2f8bee0bc23f6ee129d6ca97511d34b9/lib/_http_server.js#L557
      // @ts-expect-error
      handler = this._events.request;

      // Restore original listen method
      http.Server.prototype.listen = originalListen;
    };
    mod = await import(id);
  } finally {
    http.Server.prototype.listen = originalListen;
  }

  /**
   * In some cases we might have nested default props due to TS => JS
   */
  for (let i = 0; i < 5; i++) {
    if (mod.default) mod = mod.default;
  }

  const shouldUseWebHandlers =
    options.isMiddleware ||
    HTTP_METHODS.some(method => typeof mod[method] === 'function') ||
    typeof mod.fetch === 'function';

  if (shouldUseWebHandlers) {
    const { createWebExportsHandler } = await import('./helpers-web.js');
    const getWebExportsHandler = createWebExportsHandler(awaiter);

    handler = mod;
    if (options.isMiddleware) {
      handler = HTTP_METHODS.reduce(
        (acc, method) => {
          acc[method] = mod;
          return acc;
        },
        {} as Record<(typeof HTTP_METHODS)[number], ServerlessFunctionSignature>
      );
    }
    if (typeof mod.fetch === 'function') {
      handler = HTTP_METHODS.reduce(
        (acc, method) => {
          acc[method] = mod.fetch;
          return acc;
        },
        {} as Record<(typeof HTTP_METHODS)[number], ServerlessFunctionSignature>
      );
    }
    return getWebExportsHandler(handler, HTTP_METHODS);
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    // Only add helpers if the listener isn't an express server
    if (options.shouldAddHelpers && typeof mod.listen !== 'function') {
      await addHelpers(req, res);
    }
    if (typeof mod.listen === 'function') {
      return mod(req, res);
    }
    if (handler) {
      return handler(req, res);
    }
    return mod(req, res);
  };
}

export async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions,
  maxDuration = WAIT_UNTIL_TIMEOUT
): Promise<{
  handler: (request: IncomingMessage) => Promise<VercelProxyResponse>;
  onExit: () => Promise<void>;
}> {
  const awaiter = new Awaiter();

  Object.defineProperty(globalThis, Symbol.for('@vercel/request-context'), {
    enumerable: false,
    configurable: true,
    value: {
      get: () => ({
        waitUntil: awaiter.waitUntil.bind(awaiter),
      }),
    },
  });

  const userCode = await compileUserCode(entrypointPath, awaiter, options);
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

  const onExit = () =>
    new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn(waitUntilWarning(entrypointPath, maxDuration));
        resolve();
      }, maxDuration * 1000);
      Promise.all([awaiter.awaiting(), server.onExit()])
        .then(() => resolve())
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });

  return {
    handler,
    onExit,
  };
}
