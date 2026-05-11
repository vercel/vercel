import type { Org, ProjectLinkResult } from '@vercel-internals/types';
import type Client from '../../util/client';
import { ProjectNotFound } from '../../util/errors-ts';
import getUser from '../../util/get-user';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { getLinkedProject } from '../../util/projects/link';
import getTeamById from '../../util/teams/get-team-by-id';
import output from '../../output-manager';

export async function getEnvLinkedProject(
  client: Client,
  projectNameOrId?: string
): Promise<ProjectLinkResult> {
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
