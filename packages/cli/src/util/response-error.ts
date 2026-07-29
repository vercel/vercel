import type { Response } from './fetch';
import { APIError } from './errors-ts';

export default async function responseError(
  res: Response,
  fallbackMessage = null,
  parsedBody = {}
) {
  let body;
  let bodyError;

  if (!res.ok) {
    try {
      body = await res.json();
    } catch (_err) {
      body = parsedBody;
    }

    // Some APIs wrongly return `err` instead of `error`
    bodyError = body.error || body.err || body;
  }

  const msg = bodyError?.message || fallbackMessage || 'Response Error';
  const error = new APIError(msg, res, bodyError);

  if (body && typeof body === 'object' && Object.keys(body).length > 0) {
    // Preserve the parsed response body verbatim so commands like
    // `vercel api` can render the API's structured error payload (e.g.
    // `code`, `action`, `resource` on a 403) instead of only the prose
    // message.
    error.responseBody = body;
  }

  return error;
}
