import type Client from '../client';
import output from '../../output-manager';
import { getLinkedProject } from '../projects/link';
import getScope from '../get-scope';
import { isError } from '@vercel/error-utils';

export interface DatabaseScope {
  accountId: string;
  teamSlug: string;
  projectId: string;
  projectName: string;
}

export async function resolveDatabaseScope(
  client: Client,
  projectNameOrId?: string
): Promise<DatabaseScope | number> {
  if (projectNameOrId) {
    const { team } = await getScope(client);
    if (!team) {
      output.error(
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.'
      );
      return 1;
    }

    const project = await getProject(client, projectNameOrId, team.id);
    if (!project) {
      output.error(
        `Project "${projectNameOrId}" was not found in team "${team.slug}".`
      );
      return 1;
    }

    return {
      accountId: team.id,
      teamSlug: team.slug,
      projectId: project.id,
      projectName: project.name,
    };
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }
  if (linkedProject.status === 'not_linked') {
    output.error(
      'No linked project found. Run `vercel link` to link a project, or use --project <name-or-id>.'
    );
    return 1;
  }

  return {
    accountId: linkedProject.org.id,
    teamSlug: linkedProject.org.slug,
    projectId: linkedProject.project.id,
    projectName: linkedProject.project.name,
  };
}

async function getProject(
  client: Client,
  projectNameOrId: string,
  accountId: string
): Promise<{ id: string; name: string } | undefined> {
  try {
    return await client.fetch<{ id: string; name: string }>(
      `/v9/projects/${encodeURIComponent(projectNameOrId)}`,
      { accountId }
    );
  } catch (err) {
    if (isError(err) && 'status' in err && err.status === 404) {
      return undefined;
    }
    throw err;
  }
}
