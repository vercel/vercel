import type Client from './client';
import {
  introspectToken,
  type TokenIntrospectionResponse,
} from './introspect-token';

export interface App {
  id: string;
  name?: string;
}

export function isAppPrincipalEnabled() {
  return !!process.env['APP_PRINCIPAL_ENABLED'];
}

export function resolveAppFromToken(
  token: TokenIntrospectionResponse
): App | null {
  if (!token.active || !token.client_id) {
    return null;
  }

  return {
    id: token.client_id,
    name: token.client_name,
  };
}

/**
 * Resolves a `--scope` value against an app token's introspected team, since
 * app tokens cannot list users or teams. Applies the team as the current
 * scope on a match.
 */
export async function resolveAppTokenScope(
  client: Client,
  scope: string
): Promise<boolean> {
  const token = await introspectToken(client).catch(() => null);
  const app = token ? resolveAppFromToken(token) : null;
  const team = token?.team;

  if (!app || !team) {
    return false;
  }

  if (team.id !== scope && team.slug !== scope) {
    return false;
  }

  client.config.currentTeam = team.id;
  return true;
}
