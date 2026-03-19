import type Client from '../client';
import type { RouteVersion } from './types';

interface DeleteRoutesResponse {
  deletedCount: number;
  version: RouteVersion;
}

interface DeleteRoutesOptions {
  teamId?: string;
}

export default async function deleteRoutes(
  client: Client,
  projectId: string,
  routeIds: string[],
  options: DeleteRoutesOptions = {}
): Promise<DeleteRoutesResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);

  const queryString = query.toString();
  const url = `/v1/projects/${projectId}/routes${queryString ? `?${queryString}` : ''}`;

  return await client.fetch<DeleteRoutesResponse>(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ routeIds }),
  });
}
