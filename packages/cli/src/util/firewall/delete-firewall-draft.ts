import type Client from '../client';
import type { FirewallScope } from './scope';
import { firewallConfigUrl } from './scope';

export default async function deleteFirewallDraft(
  client: Client,
  scope: FirewallScope
): Promise<void> {
  await client.fetch(firewallConfigUrl(scope, '/draft'), {
    method: 'DELETE',
  });
}
