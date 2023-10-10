import chalk from 'chalk';

import { JSONObject } from '@vercel-internals/types';

import { STORAGE_API_PATH } from '../../commands/stores';
import Client from '../client';
import stamp from '../output/stamp';

type CreateBlobResponse = {
  store: {
    id: string;
    name: string;
  };
};

export async function createStore(options: {
  client: Client;

  type: 'blob' | 'redis' | 'postgres';
  payload: JSONObject;
}) {
  const { client, type, payload } = options;

  const pullStamp = stamp();

  client.output.spinner('creating Blob store');

  try {
    const { store } = await client.fetch<CreateBlobResponse>(
      `${STORAGE_API_PATH}/stores/${type}`,
      { method: 'POST', body: payload }
    );

    client.output.success(
      `Created blob store ${chalk.bold(store.name)} ${chalk.gray(pullStamp())}`
    );

    return {
      id: store.id,
      name: store.name,
    };
  } catch (error) {
    if (error instanceof Error) {
      client.output.error(`Failed to create store: ${error.message}`);
      return;
    }

    client.output.error(`Failed to create store: ${error}`);
  }
}
