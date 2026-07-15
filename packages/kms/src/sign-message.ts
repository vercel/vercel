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
 * Signs a base64-encoded message for an issuer using its managed signing key
 * and returns the resulting JOSE Flattened JWS.
 *
 * @throws {import('./errors').VercelKmsError} If the sign request fails.
 */
export async function signMessage(
  options: SignMessageOptions
): Promise<FlattenedJWS> {
  const { issuerId, message, token } = options;
  const baseUrl = resolveBaseUrl({
    region: options.region,
    baseUrl: options.baseUrl,
  });

  const oidcToken = await resolveOidcToken({ token });

  const { signature } = await postJson<{ signature: FlattenedJWS }>({
    baseUrl,
    path: `/kms/issuers/${encodeURIComponent(issuerId)}/sign/message`,
    token: oidcToken,
    body: { message },
  });

  return signature;
}
