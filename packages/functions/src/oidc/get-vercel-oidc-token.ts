import { getContext } from '../get-context';

/**
 * Returns the OIDC token from the request context or the environment variable.
 */
export async function getVercelOidcToken(): Promise<string> {
  if (process.env.VERCEL_OIDC_TOKEN) return process.env.VERCEL_OIDC_TOKEN;

  const token = getContext().headers?.['x-vercel-oidc-token'];

  if (!token) {
    throw new Error(
      `The 'x-vercel-oidc-token' header is missing from the request. Do you have the OIDC option enabled in the Vercel project settings?`
    );
  }

  return token;
}
