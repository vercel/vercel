import type Client from '../client';
import type { Drain, ListDrainsResponse } from './types';

export default async function getDrains(client: Client): Promise<Drain[]> {
  const { drains } = await client.fetch<ListDrainsResponse>('/v1/drains');
  return drains;
}
