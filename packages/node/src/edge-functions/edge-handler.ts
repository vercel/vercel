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

const NODE_VERSION_MAJOR = process.version.match(/^v(\d+)\.\d+/)?.[1];
const NODE_VERSION_IDENTIFIER = `node${NODE_VERSION_MAJOR}`;
if (!NODE_VERSION_MAJOR) {
  throw new Error(
    `Unable to determine current node version: process.version=${process.version}`
  );
}

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
  const { wasmAssets, plugin: edgeWasmPlugin } = createEdgeWasmPlugin();
  try {
    const result = await esbuild.build({
      // bundling behavior: use globals (like "browser") instead
      // of "require" statements for core libraries (like "node")
      platform: 'browser',
      // target syntax: only use syntax available on the current
      // version of node
      target: NODE_VERSION_IDENTIFIER,
      sourcemap: 'inline',
      bundle: true,
      plugins: [edgeWasmPlugin],
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
      ${compiledFile.text};

      const isMiddleware = ${isMiddleware};

      addEventListener('fetch', async (event) => {
        try {
          let serializedRequest = await event.request.text();
          let requestDetails = JSON.parse(serializedRequest);

          let body;

          if (requestDetails.method !== 'GET' && requestDetails.method !== 'HEAD') {
            body = Uint8Array.from(atob(requestDetails.body), c => c.charCodeAt(0));
          }

          let requestUrl = requestDetails.headers['x-forwarded-proto'] + '://' + requestDetails.headers['x-forwarded-host'] + requestDetails.url;

          let request = new Request(requestUrl, {
            headers: requestDetails.headers,
            method: requestDetails.method,
            body: body
          });

          event.request = request;

          let edgeHandler = module.exports.default;
          if (!edgeHandler) {
            throw new Error('No default export was found. Add a default export to handle requests. Learn more: https://vercel.link/creating-edge-middleware');
          }

          let response = await edgeHandler(event.request, event);

          if (!response) {
            if (isMiddleware) {
              // allow empty responses to pass through
              response = new Response(null, {
                headers: {
                  'x-middleware-next': '1',
                },
              });
            } else {
              throw new Error('Edge Function "${entrypointLabel}" did not return a response.');
            }
          }

          return event.respondWith(response);
        } catch (error) {
          // we can't easily show a meaningful stack trace
          // so, stick to just the error message for now
          const msg = error.cause
            ? (error.message + ': ' + (error.cause.message || error.cause))
            : error.message;
          event.respondWith(new Response(msg, {
            status: 500,
            headers: {
              'x-vercel-failed': 'edge-wrapper'
            }
          }));
        }
      })`;
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
