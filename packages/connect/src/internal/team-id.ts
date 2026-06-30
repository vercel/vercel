/**
 * Best-effort Vercel team-id extraction for the OAuth adapters.
 *
 * Vercel Connect's `/oauth/authorize` endpoint accepts an
 * optional `?teamId=...` query parameter that scopes the consent UI
 * to a specific team. The team id lives inside the Vercel OIDC
 * token's `owner_id` claim, so we decode the JWT payload (no
 * signature verification — we're reading our own token) and pull it
 * out.
 *
 * Failure is silent: the helper returns `undefined` if the token
 * isn't available (e.g. running outside Vercel) or the payload can't
 * be decoded. Adapters then fall back to an unqualified
 * authorization URL.
 */
import { getVercelOidcTokenSync } from '@vercel/oidc';

export function tryGetVercelTeamId(): string | undefined {
  let token: string;
  try {
    token = getVercelOidcTokenSync();
  } catch {
    return undefined;
  }
  return extractTeamIdFromOidcToken(token);
}

export function extractTeamIdFromOidcToken(token: string): string | undefined {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return undefined;
    const padded = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const claims = JSON.parse(atob(padded + '='.repeat(padLen))) as {
      owner_id?: unknown;
    };
    return typeof claims.owner_id === 'string' ? claims.owner_id : undefined;
  } catch {
    return undefined;
  }
}

export function withTeamId(
  baseUrl: string,
  teamId: string | undefined
): string {
  if (!teamId) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set('teamId', teamId);
  return url.toString();
}
