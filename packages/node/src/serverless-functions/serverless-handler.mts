import { addHelpers } from './helpers.js';
import { buildToNodeHandler } from '@edge-runtime/node-utils';
import { createServer } from 'http';
import { getConfig } from '@vercel/static-config';
import { Project } from 'ts-morph';
import { serializeBody } from '../utils.js';
import { streamToBuffer } from '@vercel/build-utils';
import primitives from '@edge-runtime/primitives'
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

const parseConfig = (entryPointPath: string) =>
  getConfig(new Project(), entryPointPath);

async function createServerlessServer(
  userCode: ServerlessFunctionSignature,
  options: ServerlessServerOptions
) {
  const server = createServer(async (req, res) => {
    if (options.shouldAddHelpers) await addHelpers(req, res);
    return userCode(req, res);
  });
  exitHook(() => server.close());
  return { url: await listen(server) };
}

async function compileUserCode(entrypointPath: string) {
  const id = isAbsolute(entrypointPath)
    ? pathToFileURL(entrypointPath).href
    : entrypointPath;
  let fn = await import(id);

  /**
   * In some cases we might have nested default props due to TS => JS
   */
  for (let i = 0; i < 5; i++) {
    if (fn.default) fn = fn.default;
  }

  const staticConfig = parseConfig(entrypointPath);
  if (staticConfig?.runtime !== 'nodejs-web') return fn

  return buildToNodeHandler(
    {
      Headers: primitives.Headers as BuildDependencies['Headers'],
      ReadableStream: primitives.ReadableStream,
      Request: primitives.Request as BuildDependencies['Request'],
      Uint8Array: Uint8Array,
      FetchEvent: primitives.FetchEvent
    },
    /** fallback when headers.host is missing for creating the absolute `req.url` URL  */
    { defaultOrigin: 'https://vercel.com' }
  )(fn)

}

export async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = await compileUserCode(entrypointPath);
  const server = await createServerlessServer(userCode, options);

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
