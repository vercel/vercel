import { Framework } from '@now/frameworks';
import Client from './client';

export async function getFrameworks(): Promise<Framework[]> {
  const client = new Client({
    apiUrl: 'https://api.zeit.co',
  });

  return await client.fetch<Framework[]>('/v1/frameworks');
}
