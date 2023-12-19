import { createEdgeWasmPlugin, WasmAssets } from './edge-wasm-plugin.mjs';
import {
  createNodeCompatPlugin,
  NodeCompatBindings,
} from './edge-node-compat-plugin.mjs';
import { EdgeRuntime, runServer } from 'edge-runtime';
import { type Dispatcher, Headers, request as undiciRequest } from 'undici';
import { isError } from '@vercel/error-utils';
import { readFileSync } from 'fs';
import { serializeBody, entrypointToOutputPath, logError } from '../utils.js';
import esbuild from 'esbuild';
import exitHook from 'exit-hook';
import { buildToHeaders } from '@edge-runtime/node-utils';
import type { VercelProxyResponse } from '../types.js';
import type { IncomingMessage } from 'http';
import { fileURLToPath } from 'url';

const NODE_VERSION_MAJOR = process.version.match(/^v(\d+)\.\d+/)?.[1];
const NODE_VERSION_IDENTIFIER = `node${NODE_VERSION_MAJOR}`;
if (!NODE_VERSION_MAJOR) {
  throw new Error(
    `Unable to determine current node version: process.version=${process.version}`
  );
}

// @ts-expect-error - depends on https://github.com/nodejs/undici/pull/2373
const toHeaders = buildToHeaders({ Headers });

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const edgeHandlerTemplate = readFileSync(
  `${__dirname}/edge-handler-template.js`
);

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
      conditions: ['edge-light', 'development'],
      // target syntax: only use syntax available on the current
      // version of node
      target: NODE_VERSION_IDENTIFIER,
      sourcemap: 'inline',
      legalComments: 'none',
      bundle: true,
      plugins: [
        edgeWasmPlugin,
        nodeCompatPlugin.plugin,
        {
          name: 'import.meta.url',
          setup({ onLoad }) {
            onLoad({ filter: /\.[cm]?js$/, namespace: 'file' }, args => {
              let code = readFileSync(args.path, 'utf8');
              code = code.replace(
                /\bimport\.meta\.url\b/g,
                JSON.stringify(import.meta.url)
              );
              return { contents: code };
            });
          },
        },
      ],
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
      (() => {
        ${compiledFile.text};
      })();

      const userModule = module.exports;

      // request metadata
      const isMiddleware = ${isMiddleware};
      const entrypointLabel = '${entrypointRelativePath}';

      // edge handler
      ${edgeHandlerTemplate};
      const dependencies = { Request, Response };
      const options = { isMiddleware, entrypointLabel };
      registerFetchListener(userModule, options, dependencies);
    `;

    return {
      userCode,
      wasmAssets,
      nodeCompatBindings: nodeCompatPlugin.bindings,
    };
  } catch (error: unknown) {
    // We can't easily show a meaningful stack trace from esbuild -> edge-runtime.
    // So, stick with just the message for now.
    console.error(`Failed to compile user code for edge runtime.`);
    if (isError(error)) logError(error);
    return undefined;
  }
}

async function createEdgeRuntimeServer(params?: {
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

    const runtime = new EdgeRuntime({
      initialCode: params.userCode,
      extend: context => {
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

    const server = await runServer({ runtime });
    exitHook(() => server.close());
    return server;
  } catch (error: any) {
    // We can't easily show a meaningful stack trace from esbuild -> edge-runtime.
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
  const server = await createEdgeRuntimeServer(userCode);

  return async function (request: IncomingMessage) {
    if (!server) {
      // this error state is already logged, but we have to wait until here to exit the process
      // this matches the serverless function bridge launcher's behavior when
      // an error is thrown in the function
      process.exit(1);
    }

    const body: Buffer | string | undefined = await serializeBody(request);
    if (body !== undefined)
      request.headers['content-length'] = String(body.length);

    const url = new URL(request.url ?? '/', server.url);
    const response = await undiciRequest(url, {
      body,
      headers: request.headers,
      method: (request.method || 'GET') as Dispatcher.HttpMethod,
    });

    const resHeaders = toHeaders(response.headers) as Headers;
    const isUserError = resHeaders.get('x-vercel-failed') === 'edge-wrapper';

    if (isUserError && response.statusCode >= 500) {
      const body = await response.body.text();
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
      status: response.statusCode,
      headers: resHeaders,
      body: response.body,
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
