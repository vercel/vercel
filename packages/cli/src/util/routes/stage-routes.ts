import type Client from '../client';
import type { RoutingRule, RouteVersion } from './types';

interface StageRoutesResponse {
  version: RouteVersion;
}

interface StageRoutesOptions {
  teamId?: string;
}

export default async function stageRoutes(
  client: Client,
  projectId: string,
  routes: RoutingRule[],
  overwrite: boolean,
  options: StageRoutesOptions = {}
): Promise<StageRoutesResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);

  const queryString = query.toString();
  const url = `/v1/projects/${projectId}/routes${queryString ? `?${queryString}` : ''}`;

  return await client.fetch<StageRoutesResponse>(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ routes, overwrite }),
  });
}
