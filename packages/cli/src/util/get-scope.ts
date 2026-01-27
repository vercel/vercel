import type Client from './client';
import getUser from './get-user';
import getTeamById from './teams/get-team-by-id';
import { TeamDeleted } from './errors-ts';
import type { Team } from '@vercel-internals/types';
import { getProjectLink } from './projects/link';

interface GetScopeOptions {
  getTeam?: boolean;
}

export default async function getScope(
  client: Client,
  opts: GetScopeOptions = {}
) {
  const user = await getUser(client);
  let contextName = user.username || user.email;
  let team: Team | null = null;

  // Priority order for determining team context:
  // 1. Linked project's orgId (if in a linked project directory)
  // 2. currentTeam (set via `vc switch`)
  // 3. defaultTeamId (user's default team for northstar users)
  let teamId: string | undefined;

  const projectLink = await getProjectLink(client, client.cwd);
  if (projectLink?.orgId?.startsWith('team_')) {
    teamId = projectLink.orgId;
  }

  if (!teamId) {
    const defaultTeamId =
      user.version === 'northstar' ? user.defaultTeamId : undefined;
    teamId = client.config.currentTeam || defaultTeamId;
  }

  if (teamId && opts.getTeam !== false) {
    team = await getTeamById(client, teamId);

    if (!team) {
      throw new TeamDeleted();
    }

    contextName = team.slug;
  }

  return { contextName, team, user };
}
