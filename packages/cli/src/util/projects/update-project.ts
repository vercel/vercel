import Client from '../client';
import type { JSONObject, ProjectSettings } from '../../types';

interface ProjectSettingsResponse extends ProjectSettings {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
}

export default async function updateProject(
  client: Client,
  prjNameOrId: string,
  settings: ProjectSettings
) {
  // `ProjectSettings` is technically compatible with JSONObject
  const body = settings as JSONObject;

  const res = await client.fetch<ProjectSettingsResponse>(
    `/v2/projects/${encodeURIComponent(prjNameOrId)}`,
    {
      method: 'PATCH',
      body,
    }
  );
  return res;
}
