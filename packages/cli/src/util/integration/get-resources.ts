import type Client from '../client';
import type { Store } from '../../commands/integration/types';

export async function getResources(
  client: Client,
  teamId: string
): Promise<Store[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('teamId', teamId);

  const storesResponse = await client.fetch<{ stores: Store[] }>(
    `/v1/storage/stores?teamId=${searchParams}`,
    {
      json: true,
    }
  );

  return storesResponse.stores;
}
