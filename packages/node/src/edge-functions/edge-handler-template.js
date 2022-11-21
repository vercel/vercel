// provided by the edge runtime:
/* global addEventListener Request Response atob */

// provided by our edge handler logic:
/* global IS_MIDDLEWARE ENTRYPOINT_LABEL */

function buildUrl(requestDetails) {
  let proto = requestDetails.headers['x-forwarded-proto'];
  let host = requestDetails.headers['x-forwarded-host'];
  let path = requestDetails.url;
  return `${proto}://${host}${path}`;
}

addEventListener('fetch', async event => {
  try {
    let serializedRequest = await event.request.text();
    let requestDetails = JSON.parse(serializedRequest);

    let body;

    if (requestDetails.method !== 'GET' && requestDetails.method !== 'HEAD') {
      body = Uint8Array.from(atob(requestDetails.body), c => c.charCodeAt(0));
    }

    let request = new Request(buildUrl(requestDetails), {
      headers: requestDetails.headers,
      method: requestDetails.method,
      body: body,
    });

    event.request = request;

    let edgeHandler = module.exports.default;
    if (!edgeHandler) {
      throw new Error(
        'No default export was found. Add a default export to handle requests. Learn more: https://vercel.link/creating-edge-middleware'
      );
    }

    let response = await edgeHandler(event.request, event);

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

    return event.respondWith(response);
  } catch (error) {
    // we can't easily show a meaningful stack trace
    // so, stick to just the error message for now
    const msg = error.cause
      ? error.message + ': ' + (error.cause.message || error.cause)
      : error.message;
    event.respondWith(
      new Response(msg, {
        status: 500,
        headers: {
          'x-vercel-failed': 'edge-wrapper',
        },
      })
    );
  }
});
