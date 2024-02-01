import Client from '../client';
import type { Project, ProjectSettings } from '@vercel-internals/types';

export default async function updateProject(
  client: Client,
  prjNameOrId: string,
  settings: ProjectSettings
) {
  const res = await client.fetch<Project>(
    `/v2/projects/${encodeURIComponent(prjNameOrId)}`,
    {
      method: 'PATCH',
      body: { ...settings },
    }
  );
  return res;
}
