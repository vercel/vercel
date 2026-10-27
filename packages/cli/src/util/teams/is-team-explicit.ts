import { getPlatformEnv } from '@vercel/build-utils';
import type Client from '../client';
import output from '../../output-manager';
import { parseArguments } from '../get-args';
import { scopeFlagPassed } from '../get-scope';
import getUser from '../get-user';
import getTeams from './get-teams';

/**
 * Whether the team or personal account a command acts on was named with
 * `--scope`, or with a `VERCEL_ORG_ID` that matches it, or is the user's only
 * scope. The link, `vercel.json`, and the saved team don't count.
 */
export async function isTeamExplicit(client: Client): Promise<boolean> {
  if (scopeFlagPassed(client.argv)) {
    // An empty `--scope` is ignored when the team is chosen, so it names
    // nothing.
    const { flags } = parseArguments(
      client.argv.slice(2),
      {},
      { permissive: true }
    );
    if (flags['--scope'] || flags['--team']) {
      return true;
    }
  }
  // Runs that ignore the saved team choose it from `VERCEL_ORG_ID` here, and
  // the command's requests go to this same team.
  const team = await client.resolveCurrentTeam({ ask: false });
  if (!team && client.isTeamUnchosen()) {
    return false;
  }
  const orgId = getPlatformEnv('ORG_ID');
  try {
    if (!team) {
      // No team means the user's personal account.
      if (orgId) {
        return orgId === (await getUser(client)).id;
      }
      return (await getTeams(client)).length === 0;
    }
    if (orgId) {
      return orgId === team;
    }
    const teams = await getTeams(client);
    return teams.length === 1 && teams[0].id === team;
  } catch (err: unknown) {
    output.debug(`Couldn't check the scope: ${err}`);
    return false;
  }
}
