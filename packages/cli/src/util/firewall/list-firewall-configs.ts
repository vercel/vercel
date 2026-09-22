import type Client from '../client';
import type { FirewallScope } from './scope';
import { firewallConfigUrl } from './scope';
import type { FirewallConfigListResponse } from './types';

export default async function listFirewallConfigs(
  client: Client,
  scope: FirewallScope
): Promise<FirewallConfigListResponse> {
  return client.fetch<FirewallConfigListResponse>(firewallConfigUrl(scope));
}
