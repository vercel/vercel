import Client from '../client';
import { isObject } from '@vercel/error-utils';
import { CustomEnvironment } from '@vercel-internals/types';

export async function getCustomEnvironments(client: Client, projectId: string) {
  try {
    const res = await client.fetch<{ environments: CustomEnvironment[] }>(
      `/projects/${encodeURIComponent(projectId)}/custom-environments`,
      { method: 'GET' }
    );
    return res.environments;
  } catch (error) {
    if (isObject(error) && error.status === 404) {
      // user is not flagged for custom environments
      return [];
    }
    throw error;
  }
}
