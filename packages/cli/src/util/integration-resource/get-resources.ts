import type Client from '../client';
import type { Resource } from './types';

export async function getResources(
  client: Client,
  teamId: string
): Promise<Resource[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('teamId', teamId);

  const storesResponse = await client.fetch<{ stores: Resource[] }>(
    `/v1/storage/stores?${searchParams}`,
    {
      json: true,
    }
  );

  return storesResponse.stores;
}
