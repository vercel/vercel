import type { Response } from 'node-fetch';
import errorOutput from './output/error';
import bytes from 'bytes';
import type { APIError } from './errors-ts';
import { getCommandName } from './pkg-name';
import output from '../output-manager';

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

export function printError(error: unknown) {
  // Coerce Strings to Error instances
  if (typeof error === 'string') {
    error = new Error(error);
  }

  const apiError = error as APIError;
  const { message, stack, status, code, sizeLimit } = apiError;

  output.debug(`handling error: ${stack}`);

  if (message === 'User force closed the prompt with 0 null') {
    return;
  }

  if (status === 403) {
    output.error(
      message ||
        `Authentication error. Run ${getCommandName('login')} to log-in again.`
    );
  } else if (status === 429) {
    // Rate limited: display the message from the server-side,
    // which contains more details
    output.error(message);
  } else if (code === 'size_limit_exceeded') {
    output.error(`File size limit exceeded (${bytes(sizeLimit)})`);
  } else if (message) {
    output.prettyError(apiError);
  } else if (status === 500) {
    output.error('Unexpected server error. Please retry.');
  } else if (code === 'USER_ABORT') {
    output.log('Canceled');
  } else {
    output.error(`Unexpected error. Please try again later. (${message})`);
  }
}
