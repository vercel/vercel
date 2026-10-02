import { getContext } from './request-context';

export const PASSPORT_HEADER_NAME = 'x-vercel-oidc-passport-token';

/**
 * Read the current request's Passport token for explicit forwarding.
 *
 * This does not verify or decode the token. Use getIdentity or verifyIdentity
 * for authentication decisions. Only forward it over HTTPS to trusted backends,
 * and do not carry it through cross-origin redirects.
 */
export function getPassportToken(): string | null {
  return getContext().headers?.[PASSPORT_HEADER_NAME] || null;
}
