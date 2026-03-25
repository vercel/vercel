import type Client from '../client';
import type { RemoveBypassRequest, RemoveBypassResponse } from './types';

interface RemoveBypassOptions {
  teamId?: string;
}

export default async function removeBypass(
  client: Client,
  projectId: string,
  body: RemoveBypassRequest,
  options: RemoveBypassOptions = {}
): Promise<RemoveBypassResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/bypass?${query.toString()}`;
  return client.fetch<RemoveBypassResponse>(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
