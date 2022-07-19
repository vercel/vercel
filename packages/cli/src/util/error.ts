import { Response } from 'node-fetch';
import errorOutput from './output/error';

export { default as handleError } from './handle-error';
export const error = errorOutput;

export interface ResponseError extends Error {
  status: number;
  serverMessage: string;
  retryAfter?: number;
  [key: string]: any;
}

export async function responseError(
  res: Response,
  fallbackMessage: string | null = null,
  parsedBody = {}
) {
  let message = '';
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

  if (!message) {
    message = fallbackMessage === null ? 'Response Error' : fallbackMessage;
  }

  const err = new Error(`${message} (${res.status})`) as ResponseError;

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

export async function responseErrorMessage(
  res: Response,
  fallbackMessage: string | null = null
) {
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

/**
 * Returns a new Object with enumberable properties that match
 * the provided `err` instance, for use with `JSON.stringify()`.
 */
export function toEnumerableError<E extends Partial<Error>>(err: E) {
  const enumerable: {
    [K in keyof E]?: E[K];
  } = {};
  enumerable.name = err.name;
  for (const key of Object.getOwnPropertyNames(err) as (keyof E)[]) {
    enumerable[key] = err[key];
  }
  return enumerable;
}
