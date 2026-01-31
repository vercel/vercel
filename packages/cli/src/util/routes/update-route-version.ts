import type Client from '../client';
import type { RouteVersion } from './types';

type VersionAction = 'promote' | 'restore' | 'discard';

interface UpdateVersionResponse {
  version: RouteVersion;
}

interface UpdateVersionOptions {
  teamId?: string;
}

export default async function updateRouteVersion(
  client: Client,
  projectId: string,
  versionId: string,
  action: VersionAction,
  options: UpdateVersionOptions = {}
): Promise<UpdateVersionResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);

  const queryString = query.toString();
  const url = `/v1/projects/${projectId}/routes/versions${queryString ? `?${queryString}` : ''}`;

  return await client.fetch<UpdateVersionResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: versionId,
      action,
    }),
  });
}
