// provided by the edge runtime:
/* global addEventListener */

function getUrl(url, headers) {
  const urlObj = new URL(url);
  const protocol = headers.get('x-forwarded-proto');
  if (protocol) urlObj.protocol = protocol.split(/\b/).shift();
  urlObj.host = headers.get('x-forwarded-host');
  urlObj.port = headers.get('x-forwarded-port');
  return urlObj.toString();
}

async function respond(userEdgeHandler, event, options, dependencies) {
  const { Request, Response } = dependencies;
  const { isMiddleware } = options;
  event.request.headers.set(
    'host',
    event.request.headers.get('x-forwarded-host')
  );
  let response = await userEdgeHandler(
    new Request(
      getUrl(event.request.url, event.request.headers),
      event.request
    ),
    event
  );

  if (!response) {
    if (isMiddleware) {
      // allow empty responses to pass through
      response = new Response(null, {
        headers: {
          'x-middleware-next': '1',
        },
      });
    } else {
      throw new Error(`Edge Function did not return a response.`);
    }
  }
  return response;
}

function toResponseError(error, Response) {
  // we can't easily show a meaningful stack trace
  // so, stick to just the error message for now
  const msg = error.cause
    ? error.message + ': ' + (error.cause.message || error.cause)
    : error.message;
  return new Response(msg, {
    status: 500,
    headers: {
      'x-vercel-failed': 'edge-wrapper',
    },
  });
}

async function parseRequestEvent(event) {
  const serializedRequest = await event.request.text();
  const requestDetails = JSON.parse(serializedRequest);
  return requestDetails;
}

// This will be invoked by logic using this template
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerFetchListener(userEdgeHandler, options, dependencies) {
  addEventListener('fetch', async event => {
    try {
      const response = await respond(
        userEdgeHandler,
        event,
        options,
        dependencies
      );
      return event.respondWith(response);
    } catch (error) {
      event.respondWith(toResponseError(error, dependencies.Response));
    }
  });
}

module.exports = {
  getUrl,
  parseRequestEvent,
  registerFetchListener,
  respond,
  toResponseError,
};
