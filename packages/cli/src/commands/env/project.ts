import type { Org, ProjectLinkResult } from '@vercel-internals/types';
import type Client from '../../util/client';
import { ProjectNotFound } from '../../util/errors-ts';
import getUser from '../../util/get-user';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { getLinkedProject } from '../../util/projects/link';
import getTeamById from '../../util/teams/get-team-by-id';
import getTeams from '../../util/teams/get-teams';
import output from '../../output-manager';

export async function getEnvLinkedProject(
  client: Client,
  projectNameOrId?: string,
  scope?: string
): Promise<ProjectLinkResult> {
  if (scope) {
    const scopeResult = await applyEnvScope(client, scope);
    if (scopeResult.status === 'error') {
      return scopeResult;
    }
  }

  if (!projectNameOrId) {
    return getLinkedProject(client);
  }

  const project = await getProjectByNameOrId(client, projectNameOrId);
  if (project instanceof ProjectNotFound) {
    output.error(project.message);
    return { status: 'error', exitCode: 1 };
  }

  const org = await getProjectOrg(client, project.accountId);
  return { status: 'linked', org, project };
}

async function getProjectOrg(client: Client, accountId: string): Promise<Org> {
  if (accountId.startsWith('team_')) {
    const team = await getTeamById(client, accountId);
    return { type: 'team', id: team.id, slug: team.slug };
  }

  const user = await getUser(client);
  return { type: 'user', id: user.id, slug: user.username };
}

async function applyEnvScope(
  client: Client,
  scope: string
): Promise<{ status: 'ok' } | { status: 'error'; exitCode: number }> {
  const user = await getUser(client);
  if (user.id === scope || user.email === scope || user.username === scope) {
    delete client.config.currentTeam;
    return { status: 'ok' };
  }

  const teams = await getTeams(client);
  const team = teams.find(team => team.id === scope || team.slug === scope);
  if (!team) {
    output.error('The specified scope does not exist');
    return { status: 'error', exitCode: 1 };
  }

  client.config.currentTeam = team.id;
  return { status: 'ok' };
}
