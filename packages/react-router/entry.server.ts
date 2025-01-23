import { PassThrough } from 'node:stream';
import { isbot } from 'isbot';
import {
  renderToPipeableStream,
  type RenderToReadableStreamOptions,
  type RenderToPipeableStreamOptions,
} from 'react-dom/server';
import { createReadableStreamFromReadable } from '@react-router/node';
import type { ReactNode } from 'react';

const ABORT_DELAY = 5000;

export type RenderOptions = {
  [K in keyof RenderToReadableStreamOptions &
    keyof RenderToPipeableStreamOptions]?: RenderToReadableStreamOptions[K];
};

export function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  router: ReactNode,
  options?: RenderOptions
): Promise<Response> {
  // If the request is from a bot, we want to wait for the full
  // response to render before sending it to the client. This
  // ensures that bots can see the full page content.
  if (isbot(request.headers.get('user-agent'))) {
    return serveTheBots(responseStatusCode, responseHeaders, router, options);
  }

  return serveBrowsers(responseStatusCode, responseHeaders, router, options);
}

function serveTheBots(
  responseStatusCode: number,
  responseHeaders: Headers,
  router: ReactNode,
  options?: RenderOptions
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(router, {
      ...options,

      // Use onAllReady to wait for the entire document to be ready
      onAllReady() {
        responseHeaders.set('Content-Type', 'text/html');
        const body = new PassThrough();
        const stream = createReadableStreamFromReadable(body);

        resolve(
          new Response(stream, {
            status: responseStatusCode,
            headers: responseHeaders,
          })
        );

        pipe(body);
      },
      onShellError(err) {
        reject(err);
      },
    });
    setTimeout(abort, ABORT_DELAY);
  });
}

function serveBrowsers(
  responseStatusCode: number,
  responseHeaders: Headers,
  router: ReactNode,
  options?: RenderOptions
): Promise<Response> {
  return new Promise((resolve, reject) => {
    let didError = false;
    const { pipe, abort } = renderToPipeableStream(router, {
      ...options,

      // use onShellReady to wait until a suspense boundary is triggered
      onShellReady() {
        responseHeaders.set('Content-Type', 'text/html');
        const body = new PassThrough();
        const stream = createReadableStreamFromReadable(body);

        resolve(
          new Response(stream, {
            status: didError ? 500 : responseStatusCode,
            headers: responseHeaders,
          })
        );

        pipe(body);
      },
      onShellError(err) {
        reject(err);
      },
      onError(err) {
        didError = true;
        console.error(err);
      },
    });
    setTimeout(abort, ABORT_DELAY);
  });
}
