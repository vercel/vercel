import { addHelpers } from './helpers.js';
import { createServer } from 'http';
import {
  WAIT_UNTIL_TIMEOUT,
  serializeBody,
  waitUntilWarning,
} from '../utils.js';
import { type Dispatcher, Headers, request as undiciRequest } from 'undici';
import { listen } from 'async-listen';
import { isAbsolute, resolve } from 'path';
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
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
};

type ServerlessFunctionSignature = (
  req: IncomingMessage | VercelRequest,
  res: ServerResponse | VercelResponse
) => void;

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

/**
 * Entrypoint map loaded from ___vc_api_entrypoint_map.json at cold start.
 * Maps output paths (e.g. "api/hello") to handler file paths (e.g. "api/hello.js").
 */
let entrypointMap: Record<string, string> | null = null;

function getEntrypointMap(): Record<string, string> {
  if (!entrypointMap) {
    const mapPath = resolve('___vc_api_entrypoint_map.json');
    entrypointMap = JSON.parse(readFileSync(mapPath, 'utf-8'));
  }
  return entrypointMap!;
}

/**
 * Cache of compiled+started servers per entrypoint, so each handler is only
 * loaded once across requests to the same route within a single lambda instance.
 */
const serverCache = new Map<
  string,
  Promise<{ url: URL; onExit: () => Promise<void> }>
>();

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

  const originalListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (this: Server) {
    server = this as Server;
    http.Server.prototype.listen = originalListen;
    serverFound();
    return this;
  };
  let listener = await import(id);

  for (let i = 0; i < 5; i++) {
    if (listener.default) listener = listener.default;
  }

  const shouldUseWebHandlers =
    HTTP_METHODS.some(method => typeof listener[method] === 'function') ||
    typeof listener.fetch === 'function';

  if (shouldUseWebHandlers) {
    http.Server.prototype.listen = originalListen;
    const { createWebExportsHandler } = await import('./helpers-web.js');
    const getWebExportsHandler = createWebExportsHandler(awaiter);

    let handler = listener;
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

  if (server) {
    return server;
  }

  throw new Error("Can't detect way to handle request");
}

async function getOrCreateServer(
  entrypointPath: string,
  awaiter: Awaiter,
  options: ServerlessServerOptions
): Promise<{ url: URL; onExit: () => Promise<void> }> {
  let cached = serverCache.get(entrypointPath);
  if (!cached) {
    cached = (async () => {
      const userCode = await compileUserCode(entrypointPath, awaiter, options);
      return createServerlessServer(userCode);
    })();
    serverCache.set(entrypointPath, cached);
  }
  return cached;
}

export async function createBundledApiEventHandler(
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

  const isStreaming = options.mode === 'streaming';

  const handler = async function (
    request: IncomingMessage
  ): Promise<VercelProxyResponse> {
    const matchedPath = request.headers['x-matched-path'] as string | undefined;

    if (!matchedPath) {
      return {
        status: 500,
        headers: new Headers({ 'content-type': 'text/plain' }),
        body: Buffer.from('Internal Server Error: missing x-matched-path header'),
        encoding: 'utf8',
      };
    }

    const map = getEntrypointMap();
    const entrypointPath = map[matchedPath];

    if (!entrypointPath) {
      return {
        status: 404,
        headers: new Headers({ 'content-type': 'text/plain' }),
        body: Buffer.from(`Not Found: no handler for ${matchedPath}`),
        encoding: 'utf8',
      };
    }

    const server = await getOrCreateServer(entrypointPath, awaiter, options);
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
        console.warn(
          waitUntilWarning('bundled-api-handler', maxDuration)
        );
        resolve();
      }, maxDuration * 1000);

      const serverExits = Array.from(serverCache.values()).map(
        async cached => {
          const srv = await cached;
          return srv.onExit();
        }
      );

      Promise.all([awaiter.awaiting(), ...serverExits])
        .then(() => resolve())
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });

  return {
    handler,
    onExit,
  };
}
