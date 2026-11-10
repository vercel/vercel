import type Client from '../client';
import type { GetVersionsResponse } from './types';

interface GetRouteVersionsOptions {
  teamId?: string;
  count?: number;
}

export default async function getRouteVersions(
  client: Client,
  projectId: string,
  options: GetRouteVersionsOptions = {}
): Promise<GetVersionsResponse> {
  const { teamId, count } = options;

  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);
  if (count) query.set('count', count.toString());

  const queryString = query.toString();
  const url = `/v1/projects/${projectId}/routes/versions${queryString ? `?${queryString}` : ''}`;

  const response = await client.fetch<GetVersionsResponse>(url);
  return response;
}
