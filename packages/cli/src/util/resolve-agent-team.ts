import { getPlatformEnv } from '@vercel/build-utils';
import type Client from './client';
import {
  assertOrgIdMatchesAppTeam,
  getAppTokenTeamId,
  isAppPrincipalEnabled,
} from './app';
import getUser from './get-user';
import getTeams from './teams/get-teams';
import { getLocalOrgId } from './get-scope';
import selectOrg from './input/select-org';
import output from '../output-manager';
import { outputAgentError } from './agent-output';
import { AGENT_REASON } from './agent-output-constants';

/**
 * The team for a run that ignores the saved team, in order: an app token's
 * own team, `VERCEL_ORG_ID`, the directory's link, then the only team the
 * credential can see. Several teams stop with `missing_scope`, or return
 * `null` (not chosen) with `ask: false`. `undefined` is the personal account.
 */
export async function resolveAgentTeam(
  client: Client,
  { ask }: { ask: boolean }
): Promise<string | undefined | null> {
  const envOrgId = getPlatformEnv('ORG_ID');

  // An app token is bound to its team, which nothing local may override, and
  // it can't list teams. A `VERCEL_ORG_ID` naming another team fails, as
  // `--scope` does.
  if (isAppPrincipalEnabled()) {
    const appTeamId = await getAppTokenTeamId(client);
    if (appTeamId) {
      assertOrgIdMatchesAppTeam(client, appTeamId);
      return appTeamId;
    }
  }

  const orgId = envOrgId ?? (await getLocalOrgId(client));

  if (orgId) {
    if (orgId.startsWith('team_')) {
      return orgId;
    }
    const user = await getUser(client);
    if (user.id === orgId) {
      return undefined;
    }

    // An explicit value that names no team or account fails; it never falls
    // back to another team.
    failScope(
      client,
      envOrgId
        ? `VERCEL_ORG_ID is set to "${orgId}", which isn't a team ID or your account ID. Use the team's ID, which starts with "team_", or pass --scope <team>.`
        : `This directory's link points to ${orgId}, which isn't a team or your account. Pass --scope <team>.`
    );
  }

  if (!ask) {
    return getOnlyChoice(client);
  }

  const org = await selectOrg(client, 'Which team?');
  return org.type === 'team' ? org.id : undefined;
}

/**
 * The only team or account the credential can use, or `null` when there's a
 * choice to make (or it can't be told). Mirrors the choices `selectOrg`
 * offers, without ever stopping the command.
 */
async function getOnlyChoice(
  client: Client
): Promise<string | undefined | null> {
  try {
    const [user, teams] = await Promise.all([
      getUser(client),
      getTeams(client),
    ]);
    const hasPersonalAccount = user.version !== 'northstar';
    if (teams.length === 1 && !hasPersonalAccount) {
      return teams[0].id;
    }
    if (teams.length === 0 && hasPersonalAccount) {
      return undefined;
    }
  } catch (err: unknown) {
    output.debug(`Couldn't list teams to choose one: ${err}`);
  }
  return null;
}

function failScope(client: Client, message: string): never {
  outputAgentError(client, {
    status: 'error',
    reason: AGENT_REASON.SCOPE_NOT_ACCESSIBLE,
    message,
  });
  throw new Error(message);
}
