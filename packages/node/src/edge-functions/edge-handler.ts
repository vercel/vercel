import { IncomingMessage } from 'http';
import { VercelProxyResponse } from '@vercel/node-bridge/types';
import { streamToBuffer } from '@vercel/build-utils';
import exitHook from 'exit-hook';
import { EdgeRuntime, runServer } from 'edge-runtime';
import type { EdgeContext } from '@edge-runtime/vm';
import esbuild from 'esbuild';
import fetch from 'node-fetch';
import { createEdgeWasmPlugin, WasmAssets } from './edge-wasm-plugin';
import { entrypointToOutputPath, logError } from '../utils';
import { readFileSync } from 'fs';
import {
  createNodeCompatPlugin,
  NodeCompatBindings,
} from './edge-node-compat-plugin';

const NODE_VERSION_MAJOR = process.version.match(/^v(\d+)\.\d+/)?.[1];
const NODE_VERSION_IDENTIFIER = `node${NODE_VERSION_MAJOR}`;
if (!NODE_VERSION_MAJOR) {
  throw new Error(
    `Unable to determine current node version: process.version=${process.version}`
  );
}

const edgeHandlerTemplate = readFileSync(
  `${__dirname}/edge-handler-template.js`
);

async function serializeRequest(message: IncomingMessage) {
  const bodyBuffer = await streamToBuffer(message);
  const body = bodyBuffer.toString('base64');
  return JSON.stringify({
    url: message.url,
    method: message.method,
    headers: message.headers,
    body,
  });
}

async function compileUserCode(
  entrypointFullPath: string,
  entrypointRelativePath: string,
  isMiddleware: boolean
): Promise<
  | undefined
  | {
      userCode: string;
      wasmAssets: WasmAssets;
      nodeCompatBindings: NodeCompatBindings;
    }
> {
  const { wasmAssets, plugin: edgeWasmPlugin } = createEdgeWasmPlugin();
  const nodeCompatPlugin = createNodeCompatPlugin();

  try {
    const result = await esbuild.build({
      // bundling behavior: use globals (like "browser") instead
      // of "require" statements for core libraries (like "node")
      platform: 'browser',
      // target syntax: only use syntax available on the current
      // version of node
      target: NODE_VERSION_IDENTIFIER,
      sourcemap: 'inline',
      legalComments: 'none',
      bundle: true,
      plugins: [edgeWasmPlugin, nodeCompatPlugin.plugin],
      entryPoints: [entrypointFullPath],
      write: false, // operate in memory
      format: 'cjs',
    });

    const compiledFile = result.outputFiles?.[0];
    if (!compiledFile) {
      throw new Error(
        `Compilation of ${entrypointRelativePath} produced no output files.`
      );
    }

    const userCode = `
      // strict mode
      "use strict";var regeneratorRuntime;

      // user code
      ${compiledFile.text};
      const userEdgeHandler = module.exports.default;
      if (!userEdgeHandler) {
        throw new Error(
          'No default export was found. Add a default export to handle requests. Learn more: https://vercel.link/creating-edge-middleware'
        );
      }

      // request metadata
      const isMiddleware = ${isMiddleware};
      const entrypointLabel = '${entrypointRelativePath}';

      // edge handler
      ${edgeHandlerTemplate};
      const dependencies = {
        Request,
        Response
      };
      const options = {
        isMiddleware,
        entrypointLabel
      };
      registerFetchListener(userEdgeHandler, options, dependencies);
    `;

    return {
      userCode,
      wasmAssets,
      nodeCompatBindings: nodeCompatPlugin.bindings,
    };
  } catch (error) {
    // We can't easily show a meaningful stack trace from ncc -> edge-runtime.
    // So, stick with just the message for now.
    console.error(`Failed to compile user code for edge runtime.`);
    logError(error);
    return undefined;
  }
}

async function createEdgeRuntime(params?: {
  userCode: string;
  wasmAssets: WasmAssets;
  nodeCompatBindings: NodeCompatBindings;
}) {
  try {
    if (!params) {
      return undefined;
    }

    const wasmBindings = await params.wasmAssets.getContext();
    const nodeCompatBindings = params.nodeCompatBindings.getContext();

    const edgeRuntime = new EdgeRuntime({
      initialCode: params.userCode,
      extend: (context: EdgeContext) => {
        Object.assign(context, {
          // This is required for esbuild wrapping logic to resolve
          module: {},

          // This is required for environment variable access.
          // In production, env var access is provided by static analysis
          // so that only the used values are available.
          process: {
            env: process.env,
          },

          // These are the global bindings for Node.js compatibility
          ...nodeCompatBindings,

          // These are the global bindings for WebAssembly module
          ...wasmBindings,
        });

        return context;
      },
    });

    const server = await runServer({ runtime: edgeRuntime });
    exitHook(server.close);

    return server;
  } catch (error) {
    // We can't easily show a meaningful stack trace from ncc -> edge-runtime.
    // So, stick with just the message for now.
    console.error('Failed to instantiate edge runtime.');
    logError(error);
    return undefined;
  }
}

export async function createEdgeEventHandler(
  entrypointFullPath: string,
  entrypointRelativePath: string,
  isMiddleware: boolean,
  isZeroConfig?: boolean
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = await compileUserCode(
    entrypointFullPath,
    entrypointRelativePath,
    isMiddleware
  );
  const server = await createEdgeRuntime(userCode);

  return async function (request: IncomingMessage) {
    if (!server) {
      // this error state is already logged, but we have to wait until here to exit the process
      // this matches the serverless function bridge launcher's behavior when
      // an error is thrown in the function
      process.exit(1);
    }

    const response = await fetch(server.url, {
      redirect: 'manual',
      method: 'post',
      body: await serializeRequest(request),
    });

    const body = await response.text();

    const isUserError =
      response.headers.get('x-vercel-failed') === 'edge-wrapper';
    if (isUserError && response.status >= 500) {
      // We can't currently get a real stack trace from the Edge Function error,
      // but we can fake a basic one that is still usefult to the user.
      const fakeStackTrace = `    at (${entrypointRelativePath})`;
      const requestPath = entrypointToRequestPath(
        entrypointRelativePath,
        isZeroConfig
      );
      console.log(
        `Error from API Route ${requestPath}: ${body}\n${fakeStackTrace}`
      );

      // this matches the serverless function bridge launcher's behavior when
      // an error is thrown in the function
      process.exit(1);
    }

    return {
      statusCode: response.status,
      headers: response.headers.raw(),
      body,
      encoding: 'utf8',
    };
  };
}

function entrypointToRequestPath(
  entrypointRelativePath: string,
  isZeroConfig?: boolean
) {
  // ensure the path starts with a slash to match conventions used elsewhere,
  // notably when rendering serverless function paths in error messages
  return '/' + entrypointToOutputPath(entrypointRelativePath, isZeroConfig);
}
