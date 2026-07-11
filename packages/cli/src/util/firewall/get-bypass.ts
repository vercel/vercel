import type Client from '../client';
import type { BypassListResponse } from './types';

interface GetBypassOptions {
  teamId?: string;
}

export default async function getBypass(
  client: Client,
  projectId: string,
  options: GetBypassOptions = {}
): Promise<BypassListResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/bypass?${query.toString()}`;
  return client.fetch<BypassListResponse>(url);
}
