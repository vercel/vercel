import type { VercelProxyResponse } from '../types';
import type { VercelRequest, VercelResponse } from './helpers';
import { addHelpers } from './helpers';
import { create as createTsCompiler } from 'ts-node';
import { createServer, ServerResponse } from 'http';
// @ts-expect-error
import { dynamicImport } from './dynamic-import.js';
import { IncomingMessage } from 'http';
import { serializeRequest } from '../utils';
import exitHook from 'exit-hook';
import fs from 'fs';
import listen from 'async-listen';
import path from 'path';
import undici from 'undici';

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
  if (entrypointPath.endsWith('.ts')) {
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
    const response = await undici.fetch(server.url, {
      redirect: 'manual',
      method: 'post',
      body: await serializeRequest(request),
      //@ts-expect-error
      headers: request.headers,
    });

    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      encoding: 'utf8',
    };
  };
}
