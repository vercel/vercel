import { getVercelOidcToken } from '@vercel/oidc';

/**
 * Resolves the OIDC token used to authenticate a sign request. When an explicit
 * `token` is supplied it is used as-is; otherwise the function's Vercel OIDC
 * token is fetched via `@vercel/oidc`. The KMS API validates the token's
 * original audience, so the token is used without an audience exchange.
 */
export async function resolveOidcToken({
  token,
}: {
  token?: string;
}): Promise<string> {
  if (token) {
    return token;
  }
  return getVercelOidcToken();
}
