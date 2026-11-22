import { getPlatformEnv } from '@vercel/build-utils';
import type Client from './client';
import getUser from './get-user';
import { outputAgentError } from './agent-output';
import { AGENT_REASON } from './agent-output-constants';
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
 * The team an app token is bound to. Like the other app-token checks, a token
 * counts as one only when it can't fetch the user.
 */
export async function getAppTokenTeamId(
  client: Client
): Promise<string | undefined> {
  try {
    await getUser(client);
    return undefined;
  } catch {
    const token = await introspectToken(client).catch(() => null);
    return token && resolveAppFromToken(token) ? token.team?.id : undefined;
  }
}

/**
 * Fails when `VERCEL_ORG_ID` names a team other than the app token's own, as
 * `--scope` does, instead of quietly using the token's team.
 */
export function assertOrgIdMatchesAppTeam(
  client: Client,
  appTeamId: string
): void {
  const envOrgId = getPlatformEnv('ORG_ID');
  if (!envOrgId || envOrgId === appTeamId) {
    return;
  }

  const message = `This token only works with team ${appTeamId}, but VERCEL_ORG_ID is set to ${envOrgId}.`;
  outputAgentError(client, {
    status: 'error',
    reason: AGENT_REASON.SCOPE_NOT_ACCESSIBLE,
    message,
  });
  throw new Error(message);
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
