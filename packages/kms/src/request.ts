import { VercelKmsError } from './errors';
import { version } from './version';

/**
 * Non-regional fallback base URL for the Vercel KMS API. The sign endpoints are
 * exposed under `/kms/issuers/:issuerId/sign/*` relative to this base.
 */
export const API_BASE_URL = 'https://api.vercel.com/v1';

/**
 * Resolves the KMS API base URL. When an explicit `baseUrl` is provided it wins
 * (used as an escape hatch / test override). Otherwise the region — from the
 * `region` argument, then the `VERCEL_REGION` environment variable — selects the
 * regional host `https://api-${region}.vercel.com/v1`. When no region is
 * available, falls back to the global {@link API_BASE_URL}.
 */
export function resolveBaseUrl({
  region,
  baseUrl,
}: {
  region?: string;
  baseUrl?: string;
}): string {
  if (baseUrl) {
    return baseUrl;
  }
  const resolved = region ?? process.env.VERCEL_REGION;
  return resolved ? `https://api-${resolved}.vercel.com/v1` : API_BASE_URL;
}

/**
 * A JOSE Flattened JWS, as returned by the message-signing endpoint.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7515#section-7.2.2
 */
export interface FlattenedJWS {
  /** Base64url-encoded JWS payload. */
  payload: string;
  /** Base64url-encoded JWS signature. */
  signature: string;
  /** Base64url-encoded protected header. */
  protected?: string;
  /** Optional unprotected JWS header. */
  header?: Record<string, unknown>;
}

/**
 * Performs an authenticated POST to a Vercel KMS sign endpoint and returns the
 * parsed JSON body. Throws {@link VercelKmsError} on a non-2xx response.
 */
export async function postJson<T>({
  baseUrl,
  path,
  token,
  body,
}: {
  baseUrl: string;
  path: string;
  token: string;
  body: unknown;
}): Promise<T> {
  const response = await fetch(new URL(`${baseUrl}${path}`), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent': `@vercel/kms@${version}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await createVercelKmsError(response);
  }

  return (await response.json()) as T;
}

async function createVercelKmsError(
  response: Response
): Promise<VercelKmsError> {
  const text = await response.text();
  const parsed = parseJsonObject(text);
  const apiError = isRecord(parsed?.error) ? parsed.error : null;

  if (apiError) {
    const { code, message, ...metadata } = apiError;
    return new VercelKmsError({
      status: response.status,
      code: typeof code === 'string' ? code : 'request_failed',
      message:
        typeof message === 'string'
          ? message
          : getFallbackErrorMessage(response),
      metadata,
    });
  }

  return new VercelKmsError({
    status: response.status,
    code: 'request_failed',
    message: getFallbackErrorMessage(response),
    metadata: {
      ...(isRecord(parsed) ? { body: parsed } : {}),
      ...(!parsed && text ? { body: text } : {}),
    },
  });
}

function getFallbackErrorMessage(response: Response): string {
  return `Vercel KMS request failed with ${response.status} ${response.statusText}`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
