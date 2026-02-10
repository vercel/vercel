import { APIError } from './errors-ts';

export default async function responseError(
  res: Response,
  fallbackMessage = null,
  parsedBody = {}
) {
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
  }

  const msg = bodyError?.message || fallbackMessage || 'Response Error';
  return new APIError(msg, res, bodyError);
}
