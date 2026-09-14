import type Client from '../client';
import type { FirewallScope } from './scope';
import { firewallConfigUrl } from './scope';
import type { FirewallConfigPatch, FirewallConfigResponse } from './types';

export default async function patchFirewallDraft(
  client: Client,
  scope: FirewallScope,
  patch: FirewallConfigPatch
): Promise<FirewallConfigResponse> {
  return client.fetch<FirewallConfigResponse>(
    firewallConfigUrl(scope, '/draft'),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }
  );
}
