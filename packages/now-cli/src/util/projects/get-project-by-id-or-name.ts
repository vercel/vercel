import Client from '../client';
import { Project } from '../../types';
import { ProjectNotFound, ProjectUnauthorized } from '../errors-ts';

export default async function getProjectByNameOrId(
  client: Client,
  projectNameOrId: string,
  accountId?: string
) {
  try {
    const project = await client.fetch<Project>(
      `/projects/${encodeURIComponent(projectNameOrId)}`,
      { accountId }
    );
    return project;
  } catch (error) {
    if (error.status === 404) {
      return new ProjectNotFound(projectNameOrId);
    }

    if (error.status === 403) {
      throw new ProjectUnauthorized(projectNameOrId);
    }

    throw error;
  }
}
