import { APIError } from './errors-ts';

interface ErrorBody {
  message?: string;
  [key: string]: unknown;
}

export default async function responseError(
  res: Response,
  fallbackMessage = null,
  parsedBody: ErrorBody = {}
) {
  let bodyError: ErrorBody | undefined;

  if (!res.ok) {
    let body: Record<string, ErrorBody | undefined>;

    try {
      body = (await res.json()) as typeof body;
    } catch (_err) {
      body = parsedBody as typeof body;
    }

    // Some APIs wrongly return `err` instead of `error`
    bodyError = body.error || body.err || (body as unknown as ErrorBody);
  }

  const msg = bodyError?.message || fallbackMessage || 'Response Error';
  return new APIError(msg, res, bodyError);
}
