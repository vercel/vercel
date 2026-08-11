import type Client from '../client';
import type { Drain } from './types';

export default async function setDrainStatus(
  client: Client,
  id: string,
  status: 'enabled' | 'disabled'
): Promise<Drain> {
  return client.fetch<Drain>(`/v1/drains/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });
}
