import { signJWT, type SignJWTOptions } from './sign-jwt';

/**
 * Options for {@link signToken}.
 *
 * @deprecated Use {@link SignJWTOptions} instead.
 */
export type SignTokenOptions = SignJWTOptions;

/**
 * Signs a JWT for an issuer using its managed signing key and returns the
 * compact JWT string.
 *
 * @deprecated Use {@link signJWT} instead, which returns the signed JWT plus
 * the signing key's `keyId`, `algorithm`, and `fingerprint`.
 *
 * @throws {import('./errors').VercelKmsError} If the sign request fails.
 */
export async function signToken(options: SignTokenOptions): Promise<string> {
  const { token } = await signJWT(options);
  return token;
}
