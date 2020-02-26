import { Response } from 'node-fetch';
import errorOutput from './output/error';

export { default as handleError } from './handle-error';
export const error = errorOutput;

class ResponseError extends Error {
  [key: string]: any;

  public status: number;
  public message: string;
  public retryAfter?: number;
  public serverMessage: string;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.serverMessage = message;
    this.message = `${message}${status ? ` (${status})` : ''}`;
  }
}

export async function responseError(
  res: Response,
  fallbackMessage: string | null = null,
  parsedBody: any = {}
) {
  let bodyError: { [key: string]: any } = {};

  if (res.status >= 400 && res.status < 500) {
    let body;

    try {
      body = await res.json();
    } catch (err) {
      body = parsedBody;
    }

    // Some APIs wrongly return `err` instead of `error`
    bodyError = body.error || body.err || {};
  }

  const err = new ResponseError(
    bodyError.message || fallbackMessage || 'Response Error',
    res.status
  );

  // Copy every field that was added manually to the error
  for (const field of Object.keys(bodyError)) {
    if (field !== 'message' && field !== 'stack') {
      err[field] = bodyError[field];
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
