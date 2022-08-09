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
  const res = await client.fetch<ProjectSettingsResponse>(
    `/v2/projects/${encodeURIComponent(prjNameOrId)}`,
    {
      method: 'PATCH',
      body: settings as JSONObject, // TODO: figure out how to not make this cast necessary
    }
  );
  return res;
}
