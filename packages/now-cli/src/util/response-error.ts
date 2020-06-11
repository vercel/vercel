import { Response } from 'node-fetch';
import { APIError } from './errors-ts';

export default async function responseError(
  res: Response,
  fallbackMessage = null,
  parsedBody = {}
) {
  let message;
  let bodyError;

  if (!res.ok) {
    let body;

    try {
      body = await res.json();
    } catch (err) {
      body = parsedBody;
    }

    // Some APIs wrongly return `err` instead of `error`
    bodyError = body.error || body.err || body;
    message = bodyError.message;
  }

  if (!message) {
    message = fallbackMessage === null ? 'Response Error' : fallbackMessage;
  }

  return new APIError(message, res, bodyError);
}
