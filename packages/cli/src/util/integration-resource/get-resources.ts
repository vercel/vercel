import type Client from '../client';
import type { Resource } from './types';

export async function getResources(client: Client): Promise<Resource[]> {
  const storesResponse = await client.fetch<{ stores: Resource[] }>(
    `/v1/storage/stores`,
    {
      json: true,
    }
  );

  return storesResponse.stores;
}
