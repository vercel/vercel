import Client from '../client';
import { STORAGE_API_PATH } from '../../commands/stores';

type ListStoresResponse = {
  stores: {
    name: string;
    id: string;
    createdAt: number;
    type: string;
  }[];
};

export async function listStores(options: { client: Client }) {
  const { client } = options;

  client.output.spinner('fetching store list');

  try {
    const response = await client.fetch<ListStoresResponse>(
      `${STORAGE_API_PATH}/stores`
    );

    return response.stores;
  } catch (error) {
    if (error instanceof Error) {
      client.output.error(`Failed to fetch blob list: ${error.message}`);
      return;
    }

    client.output.error(`Failed to fetch blob list: ${error}`);
  }
}
