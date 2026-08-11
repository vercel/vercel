import type Client from '../client';
import type { Drain } from './types';

export default async function getDrainById(
  client: Client,
  id: string
): Promise<Drain> {
  return client.fetch<Drain>(`/v1/drains/${encodeURIComponent(id)}`);
}
