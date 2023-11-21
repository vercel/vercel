import { Framework } from '@vercel/frameworks';
import Client from './client.js';

export async function getFrameworks(client: Client) {
  return await client.fetch<Framework[]>('/v1/frameworks', {
    useCurrentTeam: false,
  });
}
