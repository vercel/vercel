import { addHelpers } from './helpers';
import { createServer } from 'http';
// @ts-expect-error
import { dynamicImport } from './dynamic-import.js';
import { fetch } from 'undici';
import { serializeBody } from '../utils';
import exitHook from 'exit-hook';
import listen from 'async-listen';
import type { HeadersInit } from 'undici';
import type { ServerResponse, IncomingMessage } from 'http';
import type { VercelProxyResponse } from '../types';
import type { VercelRequest, VercelResponse } from './helpers';

type ServerlessServerOptions = {
  shouldAddHelpers: boolean;
  useRequire: boolean;
};

type ServerlessFunctionSignature = (
  req: IncomingMessage | VercelRequest,
  res: ServerResponse | VercelResponse
) => void;

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

async function compileUserCode(
  entrypointPath: string,
  options: ServerlessServerOptions
) {
  let fn = options.useRequire
    ? require(entrypointPath)
    : await dynamicImport(entrypointPath);

  /**
   * In some cases we might have nested default props due to TS => JS
   */
  for (let i = 0; i < 5; i++) {
    if (fn.default) fn = fn.default;
  }

  return fn;
}

export async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = await compileUserCode(entrypointPath, options);
  const server = await createServerlessServer(userCode, options);

  return async function (request: IncomingMessage) {
    const response = await fetch(server.url + request.url, {
      method: request.method,
      body: await serializeBody(request),
      headers: {
        ...request.headers,
        host: request.headers['x-forwarded-host'],
      } as HeadersInit,
    });

    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      encoding: 'utf8',
    };
  };
}
