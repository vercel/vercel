import type Client from '../client';
import type { FirewallConfigResponse } from './types';

interface GetFirewallConfigOptions {
  teamId?: string;
}

export default async function getFirewallConfig(
  client: Client,
  projectId: string,
  configVersion: string,
  options: GetFirewallConfigOptions = {}
): Promise<FirewallConfigResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/config/${configVersion}?${query.toString()}`;
  return client.fetch<FirewallConfigResponse>(url);
}
