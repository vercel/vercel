/**
 * App-principal tokens are minted for a Vercel App (e.g. via the OAuth
 * `client_credentials` grant). They authenticate as the app itself — there
 * is no user identity attached, and no default team: the team must be
 * supplied per-request.
 */
export function isVercelAppToken(token: string | undefined): boolean {
  return Boolean(token?.startsWith('vca_'));
}
