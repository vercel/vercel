import Client from '../client.js';
import { isAPIError, ProjectNotFound } from '../errors-ts.js';

export default async function removeProject(
  client: Client,
  projectNameOrId: string
) {
  try {
    await client.fetch<{}>(`/projects/${encodeURIComponent(projectNameOrId)}`, {
      method: 'DELETE',
    });
  } catch (error: unknown) {
    if (isAPIError(error) && error.status === 404) {
      return new ProjectNotFound(projectNameOrId);
    }

    throw error;
  }
}
