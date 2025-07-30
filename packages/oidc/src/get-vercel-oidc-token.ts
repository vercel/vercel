import { getContext } from './get-context';
import { getTokenPayload, isExpired, refreshToken } from './token';

/**
 * Gets the current OIDC token from the request context or the environment variable.
 *
 * Do not cache this value, as it is subject to change in production!
 *
 * This function is used to retrieve the OIDC token from the request context or the environment variable.
 * It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.
 *
 * Unlike the `getVercelOidcTokenSync` function, this function will optionally refresh the token if it is expired.
 * by pulling the latest token from the Vercel CLI.
 *
 * @param {boolean} refresh - Whether to refresh the token if it is expired or missing.
 * @returns {Promise<string>} A promise that resolves to the OIDC token.
 * @throws {Error} If the `x-vercel-oidc-token` header is missing from the request context and the environment variable `VERCEL_OIDC_TOKEN` is not set.
 *
 * @example
 *
 * ```js
 * // Using the OIDC token
 * getVercelOidcToken().then((token) => {
 *   console.log('OIDC Token:', token);
 * }).catch((error) => {
 *   console.error('Error:', error.message);
 * });
 * ```
 */
export async function getVercelOidcToken(refresh = false): Promise<string> {
  let token = '';
  try {
    token = getVercelOidcTokenSync();
  } catch (error) {
    if (!refresh) {
      throw error;
    }
  }
  if (refresh) {
    if (!token || isExpired(getTokenPayload(token))) {
      // better to handle the errors here or let them propogate up to the user so they can handle it?
      await refreshToken();
      token = getVercelOidcTokenSync();
    }
  }
  return token;
}

/**
 * Gets the current OIDC token from the request context or the environment variable.
 *
 * Do not cache this value, as it is subject to change in production!
 *
 * This function is used to retrieve the OIDC token from the request context or the environment variable.
 * It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.
 *
 * @returns {string} The OIDC token.
 * @throws {Error} If the `x-vercel-oidc-token` header is missing from the request context and the environment variable `VERCEL_OIDC_TOKEN` is not set.
 *
 * @example
 *
 * ```js
 * // Using the OIDC token
 * const token = getVercelOidcTokenSync();
 * console.log('OIDC Token:', token);
 * ```
 */
export function getVercelOidcTokenSync(): string {
  const token =
    getContext().headers?.['x-vercel-oidc-token'] ??
    process.env.VERCEL_OIDC_TOKEN;

  if (!token) {
    throw new Error(
      `The 'x-vercel-oidc-token' header is missing from the request. Do you have the OIDC option enabled in the Vercel project settings?`
    );
  }

  return token;
}
