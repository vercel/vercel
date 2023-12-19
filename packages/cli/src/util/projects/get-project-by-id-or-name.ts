import Client from '../client';
import type { Project } from '@vercel-internals/types';
import { isAPIError, ProjectNotFound } from '../errors-ts';

export default async function getProjectByNameOrId(
  client: Client,
  projectNameOrId: string,
  accountId?: string,
  includeRollbackInfo?: boolean
) {
  try {
    const qs = includeRollbackInfo ? '?rollbackInfo=true' : '';
    const project = await client.fetch<Project>(
      `/v9/projects/${encodeURIComponent(projectNameOrId)}${qs}`,
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
