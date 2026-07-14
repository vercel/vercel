import { getCacheKey, getJwtExpiryMs, SignatureCache } from './cache';
import { postJson, resolveBaseUrl, type FlattenedJWS } from './request';
import { resolveOidcToken } from './resolve-token';

/**
 * Options for {@link signMessage}.
 */
export interface SignMessageOptions {
  /** The ID of the issuer whose signing key should sign the message. */
  issuerId: string;
  /** Base64-encoded message to be signed. */
  message: string;
  /**
   * An explicit Vercel OIDC token to authenticate with. When omitted, the
   * function's OIDC token is fetched automatically via `@vercel/oidc`.
   */
  token?: string;
  /**
   * When `true`, bypasses the in-memory cache for reads and performs a fresh
   * signature. The fresh result still replaces any cached entry.
   * @default false
   */
  skipCache?: boolean;
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
 * Upper bound on the number of cached signatures before least-recently-used
 * eviction kicks in.
 */
const MAX_CACHE_ENTRIES = 1000;

const signatureCache = new SignatureCache<FlattenedJWS>(MAX_CACHE_ENTRIES);

/**
 * Signs a base64-encoded message for an issuer using its managed signing key
 * and returns the resulting JOSE Flattened JWS.
 *
 * The result is cached in memory keyed by the OIDC token and message. Because a
 * message signature has no intrinsic expiry, the cache entry expires when the
 * authenticating OIDC token expires.
 *
 * @throws {import('./errors').VercelKmsError} If the sign request fails.
 */
export async function signMessage(
  options: SignMessageOptions
): Promise<FlattenedJWS> {
  const { issuerId, message, token, skipCache = false } = options;
  const baseUrl = resolveBaseUrl({
    region: options.region,
    baseUrl: options.baseUrl,
  });

  const oidcToken = await resolveOidcToken({ token });
  const cacheKey = await getCacheKey([
    'signMessage',
    oidcToken,
    issuerId,
    message,
  ]);

  if (!skipCache) {
    const cached = signatureCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const { signature } = await postJson<{ signature: FlattenedJWS }>({
    baseUrl,
    path: `/kms/issuers/${encodeURIComponent(issuerId)}/sign/message`,
    token: oidcToken,
    body: { message },
  });

  const expiresAt = getJwtExpiryMs(oidcToken);
  if (expiresAt !== undefined && expiresAt > Date.now()) {
    signatureCache.set({ key: cacheKey, value: signature, expiresAt });
  }

  return signature;
}
