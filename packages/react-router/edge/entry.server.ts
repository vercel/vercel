import { isbot } from 'isbot';
import { createElement } from 'react';
import {
  renderToReadableStream,
  type RenderToReadableStreamOptions,
  type RenderToPipeableStreamOptions,
} from 'react-dom/server';
import { ServerRouter } from 'react-router';
import type { AppLoadContext, EntryContext } from 'react-router';

export type RenderOptions = {
  [K in keyof RenderToReadableStreamOptions &
    keyof RenderToPipeableStreamOptions]?: RenderToReadableStreamOptions[K];
};

export async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext?: AppLoadContext,
  options?: RenderOptions
): Promise<Response> {
  const body = await renderToReadableStream(
    createElement(ServerRouter, {
      context: routerContext,
      url: request.url,
      nonce: options?.nonce,
    }),
    {
      ...options,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    }
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
