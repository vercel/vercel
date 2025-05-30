import { getContext } from '../get-context';

/**
 * Returns the OIDC token from the request context or the environment variable.
 *
 * This function is used to retrieve the OIDC token from the request context or the environment variable.
 * It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.
 *
 * context headers.
 *
 * @returns {Promise<string>} A promise that resolves to the OIDC token.
 * @throws {Error} If the `x-vercel-oidc-token` header is missing from the request context and the environment variable `VERCEL_OIDC_TOKEN` is not set.
 * @throws {Error} If `VERCEL_ENV` is set to 'development' and the OIDC token is invalid.
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
export async function getVercelOidcToken(): Promise<string> {
  const token =
    getContext().headers?.['x-vercel-oidc-token'] ??
    process.env.VERCEL_OIDC_TOKEN;

  if (!token) {
    throw new Error(
      `The Vercel OIDC token is missing in your environment. Do you have the OIDC option enabled in the Vercel project settings?`
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createRemoteJWKSet, jwtVerify, errors } = await import('jose');
    try {
      const jwks = createRemoteJWKSet(new URL('https://oidc.vercel.com'));
      await jwtVerify(token, jwks);
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        console.warn(
          'Invalid Vercel OIDC Token. Do you have multiple `.env.*` files with `VERCEL_OIDC_TOKEN` defined?',
          error
        );
      }
      throw error;
    }
  }

  return token;
}
