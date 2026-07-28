import { VercelOidcTokenError } from './token-error';

/**
 * The decoded payload of a Vercel OIDC token.
 *
 * Note that {@link getTokenPayload} does not verify the token's signature —
 * use `verifyVercelOidcToken` when the claims must be trusted locally.
 */
export interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
  /**
   * The team (owner) the token is scoped to.
   */
  owner_id?: string;
  /**
   * The project the token is scoped to.
   */
  project_id?: string;
  /**
   * The deployment environment the token was issued for.
   */
  environment?: string;
}

/**
 * Decodes the payload of a Vercel OIDC token without verifying its
 * signature.
 *
 * Useful for reading the token's own claims (e.g. `project_id`, `exp`)
 * before handing the token to an API that verifies it server-side. Do not
 * use the returned claims to make trust decisions locally — use
 * `verifyVercelOidcToken` for that.
 *
 * @param token - The OIDC token (a JWT).
 * @returns The decoded token payload.
 * @throws {VercelOidcTokenError} If the token is not a well-formed JWT.
 */
export function getTokenPayload(token: string): TokenPayload {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new VercelOidcTokenError('Invalid token.');
  }

  const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  return JSON.parse(decodeBase64(padded));
}

/**
 * Returns whether the token payload is expired.
 *
 * @param token - The decoded token payload.
 * @param bufferMs - Optional buffer in milliseconds before the actual expiry
 * at which the token is already considered expired.
 */
export function isExpired(token: TokenPayload, bufferMs = 0): boolean {
  return token.exp * 1000 < Date.now() + bufferMs;
}

function decodeBase64(value: string): string {
  // Buffer exists in Node.js and Edge Runtime; fall back to atob in
  // browser-like runtimes.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
