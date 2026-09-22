import { postJson, resolveBaseUrl } from './request';
import { resolveOidcToken } from './resolve-token';

/**
 * Options for {@link signToken}.
 */
export interface SignTokenOptions {
  /** The ID of the issuer whose signing key should sign the token. */
  issuerId: string;
  /** The claims to include in the token. */
  claims?: Record<string, unknown>;
  /** Additional headers to include in the token. */
  headers?: Record<string, unknown>;
  /** The time-to-live for the token, in seconds. Defaults to 300. */
  ttl?: number | null;
  /**
   * An explicit Vercel OIDC token to authenticate with. When omitted, the
   * function's OIDC token is fetched automatically via `@vercel/oidc`.
   */
  token?: string;
  /**
   * Region for the regional KMS API host, e.g. `sfo1`, producing
   * `https://api-<region>.vercel.com/v1`. Defaults to the `VERCEL_REGION`
   * environment variable, falling back to the global `api.vercel.com` host.
   * Ignored when `baseUrl` is provided.
   */
  region?: string;
  /**
   * Override the API base URL. Takes precedence over `region`.
   * @default "https://api-<region>.vercel.com/v1" or "https://api.vercel.com/v1"
   */
  baseUrl?: string;
}

/**
 * Signs a JWT for an issuer using its managed signing key and returns the
 * compact JWT string.
 *
 * @throws {import('./errors').VercelKmsError} If the sign request fails.
 */
export async function signToken(options: SignTokenOptions): Promise<string> {
  const { issuerId, claims = {}, headers = {}, ttl = 300, token } = options;
  const baseUrl = resolveBaseUrl({
    region: options.region,
    baseUrl: options.baseUrl,
  });

  const oidcToken = await resolveOidcToken({ token });

  const { token: signedToken } = await postJson<{ token: string }>({
    baseUrl,
    path: `/kms/issuers/${encodeURIComponent(issuerId)}/sign/token`,
    token: oidcToken,
    body: { claims, headers, ttl },
  });

  return signedToken;
}
