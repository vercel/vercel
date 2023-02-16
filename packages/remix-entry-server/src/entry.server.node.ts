import { PassThrough } from 'stream';
import { renderToPipeableStream } from 'react-dom/server';
import { Response } from '@remix-run/node';
import isbot from 'isbot';

const ABORT_DELAY = 5000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixServer: JSX.Element
) {
  // If the request is from a bot, we want to wait for the full
  // response to render before sending it to the client. This
  // ensures that bots can see the full page content.
  if (isbot(request.headers.get('user-agent'))) {
    return serveTheBots(responseStatusCode, responseHeaders, remixServer);
  }

  return serveBrowsers(responseStatusCode, responseHeaders, remixServer);
}

function serveTheBots(
  responseStatusCode: number,
  responseHeaders: Headers,
  remixServer: any
) {
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(remixServer, {
      // Use onAllReady to wait for the entire document to be ready
      onAllReady() {
        responseHeaders.set('Content-Type', 'text/html');
        const body = new PassThrough();
        pipe(body);
        resolve(
          new Response(body, {
            status: responseStatusCode,
            headers: responseHeaders,
          })
        );
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
  remixServer: any
) {
  return new Promise((resolve, reject) => {
    let didError = false;
    const { pipe, abort } = renderToPipeableStream(remixServer, {
      // use onShellReady to wait until a suspense boundary is triggered
      onShellReady() {
        responseHeaders.set('Content-Type', 'text/html');
        const body = new PassThrough();
        pipe(body);
        resolve(
          new Response(body, {
            status: didError ? 500 : responseStatusCode,
            headers: responseHeaders,
          })
        );
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
