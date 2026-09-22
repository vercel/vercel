import { postJson, resolveBaseUrl, type FlattenedJWS } from './request';
import { resolveOidcToken } from './resolve-token';

/**
 * Options for {@link signMessage}.
 */
export interface SignMessageOptions {
  /** The ID of the issuer whose signing key should sign the message. */
  issuerId: string;
  /**
   * The message to sign. Provide raw bytes as a `Uint8Array`, or a `string`
   * which is treated as UTF-8 text. The value is base64-encoded internally
   * before being sent to the KMS API.
   */
  message: Uint8Array | string;
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
 * Signs a message for an issuer using its managed signing key and returns the
 * resulting JOSE Flattened JWS. The message may be provided as raw bytes
 * (`Uint8Array`) or a UTF-8 `string`; it is base64-encoded before being sent.
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
    body: { message: toBase64(message) },
  });

  return signature;
}

/**
 * Base64-encodes a message for transport. A `string` is encoded as UTF-8; a
 * `Uint8Array` is encoded as its raw bytes.
 */
function toBase64(message: Uint8Array | string): string {
  return (
    typeof message === 'string'
      ? Buffer.from(message, 'utf-8')
      : Buffer.from(message)
  ).toString('base64');
}
