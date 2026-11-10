import type Client from '../client';
import type { FirewallScope } from './scope';
import { firewallConfigUrl } from './scope';
import type { FirewallConfigResponse } from './types';

export default async function activateFirewallConfig(
  client: Client,
  scope: FirewallScope,
  configVersion: string
): Promise<FirewallConfigResponse> {
  return client.fetch<FirewallConfigResponse>(
    firewallConfigUrl(scope, `/${configVersion}/activate`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
}
