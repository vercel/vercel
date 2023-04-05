import { addHelpers } from './helpers';
import { create as createTsCompiler } from 'ts-node';
import { createServer } from 'http';
// @ts-expect-error
import { dynamicImport } from './dynamic-import.js';
import { fetch } from 'undici';
import { isTypeScriptExtension, serializeRequest } from '../utils';
import exitHook from 'exit-hook';
import fs from 'fs';
import listen from 'async-listen';
import path from 'path';
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
  const server = createServer((req, res) => {
    if (options.shouldAddHelpers) addHelpers(req, res);
    return userCode(req, res);
  });
  exitHook(server.close);
  return { url: await listen(server) };
}

async function compileUserCode(
  entrypointPath: string,
  options: ServerlessServerOptions
) {
  let userCode;
  if (isTypeScriptExtension(entrypointPath)) {
    const { compile } = createTsCompiler();
    const content = fs.readFileSync(entrypointPath, 'utf8');
    const filename = path.basename(entrypointPath);
    userCode = eval(compile(content, filename)) as ServerlessFunctionSignature;
  } else {
    userCode = options.useRequire
      ? require(entrypointPath)
      : await dynamicImport(entrypointPath);
  }
  return userCode;
}

export async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = await compileUserCode(entrypointPath, options);
  const server = await createServerlessServer(userCode, options);

  return async function (request: IncomingMessage) {
    const query = request.url?.split('?')[1];
    const url = query === undefined ? server.url : `${server.url}?${query}`;

    const response = await fetch(url, {
      redirect: 'manual',
      method: 'post',
      body: await serializeRequest(request),
      headers: request.headers as HeadersInit,
    });

    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      encoding: 'utf8',
    };
  };
}
