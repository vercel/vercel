import errorOutput from './output/error';

export { default as handleError } from './handle-error';
export const error = errorOutput;

export async function responseError(
  res,
  fallbackMessage = null,
  parsedBody = {}
) {
  let message;
  let bodyError;

  if (res.status >= 400 && res.status < 500) {
    let body;

    try {
      body = await res.json();
    } catch (err) {
      body = parsedBody;
    }

    // Some APIs wrongly return `err` instead of `error`
    bodyError = body.error || body.err || {};
    message = bodyError.message;
  }

  if (message == null) {
    message = fallbackMessage === null ? 'Response Error' : fallbackMessage;
  }

  const err = new Error(`${message} (${res.status})`);

  err.status = res.status;
  err.serverMessage = message;

  // Copy every field that was added manually to the error
  if (bodyError) {
    for (const field of Object.keys(bodyError)) {
      if (field !== 'message') {
        err[field] = bodyError[field];
      }
    }
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');

    if (retryAfter) {
      err.retryAfter = parseInt(retryAfter, 10);
    }
  }

  return err;
}

export async function responseErrorMessage(res, fallbackMessage = null) {
  let message;

  if (res.status >= 400 && res.status < 500) {
    let body;

    try {
      body = await res.json();
    } catch (err) {
      body = {};
    }

    // Some APIs wrongly return `err` instead of `error`
    message = (body.error || body.err || {}).message;
  }

  if (message == null) {
    message = fallbackMessage === null ? 'Response Error' : fallbackMessage;
  }

  return `${message} (${res.status})`;
}
