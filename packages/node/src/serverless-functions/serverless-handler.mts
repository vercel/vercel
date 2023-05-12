import { addHelpers } from './helpers.js';
import { buildToNodeHandler } from '@edge-runtime/node-utils';
import { createServer } from 'http';
import { serializeBody } from '../utils.js';
import { streamToBuffer } from '@vercel/build-utils';
import primitives from '@edge-runtime/primitives';
import exitHook from 'exit-hook';
import fetch from 'node-fetch';
import { listen } from 'async-listen';
import { isAbsolute } from 'path';
import { pathToFileURL } from 'url';
import type { BuildDependencies } from '@edge-runtime/node-utils';
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

/* https://nextjs.org/docs/app/building-your-application/routing/router-handlers#supported-http-methods */
const HTTP_METHODS = [
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
] as const;

type HTTP_METHOD = typeof HTTP_METHODS[number];

function isHTTPMethod(maybeMethod: string): maybeMethod is HTTP_METHOD {
  return HTTP_METHODS.includes(maybeMethod as HTTP_METHOD);
}

const defaultHttpHandler: ServerlessFunctionSignature = (_, res) => {
  res.statusCode = 405;
  res.end();
};

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

  if (Object.keys(listener).every(key => !isHTTPMethod(key))) {
    return async (req: IncomingMessage, res: ServerResponse) => {
      if (options.shouldAddHelpers) await addHelpers(req, res);
      return listener(req, res);
    };
  }

  HTTP_METHODS.forEach(httpMethod => {
    listener[httpMethod] =
      listener[httpMethod] === undefined
        ? defaultHttpHandler
        : buildToNodeHandler(
            {
              Headers: primitives.Headers as BuildDependencies['Headers'],
              ReadableStream: primitives.ReadableStream,
              Request: primitives.Request as BuildDependencies['Request'],
              Uint8Array: Uint8Array,
              FetchEvent: primitives.FetchEvent,
            },
            { defaultOrigin: 'https://vercel.com' }
          )(listener[httpMethod]);
  });

  return (req: IncomingMessage, res: ServerResponse) =>
    listener[req.method ?? 'GET'](req, res);
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
      response.headers.delete('transfer-encoding');
      response.headers.set('content-length', body.length);
    }

    return {
      status: response.status,
      headers: response.headers,
      body,
      encoding: 'utf8',
    };
  };
}
