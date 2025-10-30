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
  userCode: ServerlessFunctionSignature | Server
): Promise<{ url: URL; onExit: () => Promise<void> }> {
  let server: Server;
  if (typeof userCode === 'function') {
    server = createServer(userCode);
  } else {
    server = userCode;
  }
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

  let server: Server | null = null;
  let serverFound = () => {};

  /**
   * Override the listen method while we import the module,
   * so we can capture the server instance it invokes (if it does)
   *
   * This will cause the `.listen()` to be stubbed once and then restored, so
   * the arguments supplied will be ignored. Eg.
   *
   * app.listen(3000, () => {
   *   console.log('Server is running on port 3000')
   * })
   *
   * The port 3000 and console.log statement will not be executed.
   */
  const originalListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (this: Server) {
    server = this as Server;
    // Restore original listen method
    http.Server.prototype.listen = originalListen;
    serverFound();
    return this;
  };
  let listener = await import(id);

  /**
   * In some cases we might have nested default props due to TS => JS
   */
  for (let i = 0; i < 5; i++) {
    if (listener.default) listener = listener.default;
  }

  const shouldUseWebHandlers =
    options.isMiddleware ||
    HTTP_METHODS.some(method => typeof listener[method] === 'function') ||
    typeof listener.fetch === 'function';

  if (shouldUseWebHandlers) {
    http.Server.prototype.listen = originalListen;
    const { createWebExportsHandler } = await import('./helpers-web.js');
    const getWebExportsHandler = createWebExportsHandler(awaiter);

    let handler = listener;
    if (options.isMiddleware) {
      handler = HTTP_METHODS.reduce(
        (acc, method) => {
          acc[method] = listener;
          return acc;
        },
        {} as Record<(typeof HTTP_METHODS)[number], ServerlessFunctionSignature>
      );
    }
    if (typeof listener.fetch === 'function') {
      handler = HTTP_METHODS.reduce(
        (acc, method) => {
          acc[method] = listener.fetch;
          return acc;
        },
        {} as Record<(typeof HTTP_METHODS)[number], ServerlessFunctionSignature>
      );
    }
    return getWebExportsHandler(handler, HTTP_METHODS);
  }

  if (typeof listener === 'function') {
    http.Server.prototype.listen = originalListen;
    return async (req: IncomingMessage, res: ServerResponse) => {
      // Only add helpers if the listener isn't an express server
      if (options.shouldAddHelpers && typeof listener.listen !== 'function') {
        await addHelpers(req, res);
      }

      return listener(req, res);
    };
  }

  if (!server) {
    await new Promise(resolve => {
      serverFound = resolve as () => void;
      const maxTimeToWaitForServer = 1000;
      setTimeout(resolve, maxTimeToWaitForServer);
    });
  }

  http.Server.prototype.listen = originalListen;

  // If we have a server instance, server.listen() was called from the module, we can use
  // we can proxy requests to it instead of initializing our own server
  if (server) {
    return server;
  }

  throw new Error("Can't detect way to handle request");
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
