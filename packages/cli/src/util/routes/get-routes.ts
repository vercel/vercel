import type Client from '../client';
import type { GetRoutesResponse, RouteType } from './types';

interface GetRoutesOptions {
  teamId?: string;
  search?: string;
  filter?: RouteType;
  versionId?: string;
  diff?: boolean;
}

export default async function getRoutes(
  client: Client,
  projectId: string,
  options: GetRoutesOptions = {}
): Promise<GetRoutesResponse> {
  const { teamId, search, filter, versionId, diff } = options;

  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);
  if (search) query.set('q', search);
  if (filter) query.set('filter', filter);
  if (versionId) query.set('versionId', versionId);
  if (diff) query.set('diff', 'true');

  const queryString = query.toString();
  const url = `/v1/projects/${projectId}/routes${queryString ? `?${queryString}` : ''}`;

  const response = await client.fetch<GetRoutesResponse>(url);
  return response;
}
