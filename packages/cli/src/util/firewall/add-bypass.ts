import type Client from '../client';
import type { AddBypassRequest, AddBypassResponse } from './types';

interface AddBypassOptions {
  teamId?: string;
}

export default async function addBypass(
  client: Client,
  projectId: string,
  body: AddBypassRequest,
  options: AddBypassOptions = {}
): Promise<AddBypassResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/bypass?${query.toString()}`;
  return client.fetch<AddBypassResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
