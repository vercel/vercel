import type Client from '../client';
import type { FirewallConfigPatch, FirewallConfigResponse } from './types';

interface PatchDraftOptions {
  teamId?: string;
}

export default async function patchFirewallDraft(
  client: Client,
  projectId: string,
  patch: FirewallConfigPatch,
  options: PatchDraftOptions = {}
): Promise<FirewallConfigResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/config/draft?${query.toString()}`;
  return client.fetch<FirewallConfigResponse>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}
