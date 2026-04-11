import type Client from '../client';
import type { FirewallConfigResponse } from './types';

interface ActivateOptions {
  teamId?: string;
}

export default async function activateFirewallConfig(
  client: Client,
  projectId: string,
  configVersion: string,
  options: ActivateOptions = {}
): Promise<FirewallConfigResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/config/${configVersion}/activate?${query.toString()}`;
  return client.fetch<FirewallConfigResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}
