import { isbot } from 'isbot';
import {
  renderToReadableStream,
  type RenderToReadableStreamOptions,
  type RenderToPipeableStreamOptions,
} from 'react-dom/server';
import type { ReactNode } from 'react';

export type RenderOptions = {
  [K in keyof RenderToReadableStreamOptions &
    keyof RenderToPipeableStreamOptions]?: RenderToReadableStreamOptions[K];
};

export async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  router: ReactNode,
  options?: RenderOptions
): Promise<Response> {
  const body = await renderToReadableStream(router, {
    ...options,
    signal: request.signal,
    onError(error) {
      console.error(error);
      responseStatusCode = 500;
    },
  });

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
