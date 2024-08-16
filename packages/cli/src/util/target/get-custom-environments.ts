import { CustomEnvironment } from '@vercel-internals/types';
import type Client from '../client';

export async function getCustomEnvironments(client: Client, projectId: string) {
  const url = `/projects/${encodeURIComponent(projectId)}/custom-environments`;
  const { environments } = await client.fetch<{
    environments: CustomEnvironment[];
  }>(url);
  return environments;
}
