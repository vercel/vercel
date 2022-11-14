import Client from '../client';
import { Project } from '../../types';
import { isAPIError, ProjectNotFound } from '../errors-ts';

export default async function getProjectByNameOrId(
  client: Client,
  projectNameOrId: string,
  accountId?: string
) {
  try {
    const project = await client.fetch<Project>(
      `/v8/projects/${encodeURIComponent(projectNameOrId)}`,
      { accountId }
    );
    return project;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 404) {
      return new ProjectNotFound(projectNameOrId);
    }

    throw err;
  }
}
