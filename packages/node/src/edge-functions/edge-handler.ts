import { IncomingMessage } from 'http';
import { VercelProxyResponse } from '@vercel/node-bridge/types';
import { streamToBuffer } from '@vercel/build-utils';
import exitHook from 'exit-hook';
import { EdgeRuntime, runServer } from 'edge-runtime';
import type { EdgeContext } from '@edge-runtime/vm';
import esbuild from 'esbuild';
import fetch from 'node-fetch';
import { createEdgeWasmPlugin, WasmAssets } from './edge-wasm-plugin';
import { logError } from '../utils';
import { stat, readFile, readFileSync } from 'fs-extra';
import path from 'path';
import { createAssetFilePlugin } from './esbuild-plugin-asset-file-import';
import {
  createFileSystemPlugin,
  FileSystem,
} from './esbuild-file-system-plugin';

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
  entrypointPath: string,
  entrypointLabel: string,
  isMiddleware: boolean
): Promise<undefined | { userCode: string; wasmAssets: WasmAssets }> {
  try {
    const { wasmAssets, plugin: edgeWasmPlugin } = createEdgeWasmPlugin();

    const fileSystem: FileSystem = {
      async resolveImportPath(importer, importee) {
        const resolvedPath = path.resolve(path.dirname(importer), importee);

        // We only want to read files
        const fileStat = await stat(resolvedPath).catch(() => null);
        if (fileStat?.isFile()) {
          return resolvedPath;
        }
      },
      readFile,
    };

    const result = await esbuild.build({
      // bundling behavior: use globals (like "browser") instead
      // of "require" statements for core libraries (like "node")
      platform: 'browser',
      // target syntax: only use syntax available on the current
      // version of node
      target: NODE_VERSION_IDENTIFIER,
      sourcemap: 'inline',
      bundle: true,
      plugins: [
        edgeWasmPlugin,
        createAssetFilePlugin(fileSystem).plugin,
        createFileSystemPlugin(fileSystem),
      ],
      entryPoints: [entrypointPath],
      write: false, // operate in memory
      format: 'cjs',
    });

    const compiledFile = result.outputFiles?.[0];
    if (!compiledFile) {
      throw new Error(
        `Compilation of ${entrypointLabel} produced no output files.`
      );
    }

    const userCode = `
      // user code
      ${compiledFile.text};

      // request metadata
      const IS_MIDDLEWARE = ${isMiddleware};
      const ENTRYPOINT_LABEL = '${entrypointLabel}';

      // edge handler
      ${edgeHandlerTemplate}
    `;

    return { userCode, wasmAssets };
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
}) {
  try {
    if (!params) {
      return undefined;
    }

    const wasmBindings = await params.wasmAssets.getContext();
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
  entrypointPath: string,
  entrypointLabel: string,
  isMiddleware: boolean
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = await compileUserCode(
    entrypointPath,
    entrypointLabel,
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
      // this error was "unhandled" from the user code's perspective
      console.log(`Unhandled rejection: ${body}`);

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
