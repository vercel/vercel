import type Client from '../client';
import type { FirewallConfigListResponse } from './types';

interface ListFirewallConfigsOptions {
  teamId?: string;
}

export default async function listFirewallConfigs(
  client: Client,
  projectId: string,
  options: ListFirewallConfigsOptions = {}
): Promise<FirewallConfigListResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/config?${query.toString()}`;
  return client.fetch<FirewallConfigListResponse>(url);
}
