// provided by the edge runtime:
/* global addEventListener Request Response */

// provided by our edge handler logic:
/* global IS_MIDDLEWARE ENTRYPOINT_LABEL */

function buildUrl(requestDetails) {
  let proto = requestDetails.headers['x-forwarded-proto'];
  let host = requestDetails.headers['x-forwarded-host'];
  let path = requestDetails.url;
  return `${proto}://${host}${path}`;
}

async function respond(userEdgeHandler, requestDetails, event) {
  let body;

  if (requestDetails.method !== 'GET' && requestDetails.method !== 'HEAD') {
    if (requestDetails.body) {
      body = Uint8Array.from(atob(requestDetails.body), c => c.charCodeAt(0));
    }
  }

  let request = new Request(buildUrl(requestDetails), {
    headers: requestDetails.headers,
    method: requestDetails.method,
    body: body,
  });

  event.request = request;

  let response = await userEdgeHandler(event.request, event);

  if (!response) {
    if (IS_MIDDLEWARE) {
      // allow empty responses to pass through
      response = new Response(null, {
        headers: {
          'x-middleware-next': '1',
        },
      });
    } else {
      throw new Error(
        `Edge Function "${ENTRYPOINT_LABEL}" did not return a response.`
      );
    }
  }
  return response;
}

function toResponseError(error) {
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
  let serializedRequest = await event.request.text();
  let requestDetails = JSON.parse(serializedRequest);
  return requestDetails;
}

// This will be invoked by logic using this template
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerFetchListener(userEdgeHandler) {
  addEventListener('fetch', async event => {
    try {
      let requestDetails = await parseRequestEvent(event);
      let response = await respond(userEdgeHandler, requestDetails, event);
      return event.respondWith(response);
    } catch (error) {
      event.respondWith(toResponseError(error));
    }
  });
}
