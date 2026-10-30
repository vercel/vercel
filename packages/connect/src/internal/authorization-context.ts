/**
 * Best-effort Vercel authorization context extraction for the OAuth adapters.
 *
 * Vercel Connect's `/oauth/authorize` endpoint accepts an
 * optional team id, project id, and environment to scope the consent UI.
 * These values come from the Vercel OIDC token's `owner_id`, `project_id`,
 * and `custom_environment_id` or `environment` claims. We decode the JWT
 * payload without signature verification — we're reading our own token.
 *
 * Failure is silent: the helper returns `undefined` if the token
 * isn't available (e.g. running outside Vercel) or the payload can't
 * be decoded. Adapters then fall back to an unqualified
 * authorization URL.
 */
import { getVercelOidcTokenSync } from '@vercel/oidc';

interface AuthorizationContext {
  teamId?: string;
  projectId?: string;
  environment?: string;
}

export function tryGetVercelAuthorizationContext():
  | AuthorizationContext
  | undefined {
  let token: string;
  try {
    token = getVercelOidcTokenSync();
  } catch {
    return undefined;
  }
  return extractAuthorizationContextFromOidcToken(token);
}

export function extractAuthorizationContextFromOidcToken(
  token: string
): AuthorizationContext | undefined {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return undefined;
    const padded = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const claims = JSON.parse(atob(padded + '='.repeat(padLen))) as {
      owner_id?: unknown;
      project_id?: unknown;
      custom_environment_id?: unknown;
      environment?: unknown;
    };
    const environment = claims.custom_environment_id || claims.environment;
    return {
      teamId: typeof claims.owner_id === 'string' ? claims.owner_id : undefined,
      projectId:
        typeof claims.project_id === 'string' ? claims.project_id : undefined,
      environment: typeof environment === 'string' ? environment : undefined,
    };
  } catch {
    return undefined;
  }
}

export function withAuthorizationContext(
  baseUrl: string,
  context: AuthorizationContext | undefined
): string {
  if (!context) return baseUrl;
  const url = new URL(baseUrl);
  if (context.teamId) url.searchParams.set('teamId', context.teamId);
  if (context.projectId) url.searchParams.set('projectId', context.projectId);
  if (context.environment) {
    url.searchParams.set('environment', context.environment);
  }
  return url.toString();
}
