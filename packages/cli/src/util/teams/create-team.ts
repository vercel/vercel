import type { Team } from '@vercel-internals/types';
import Client from '../client.js';

export default async function createTeam(
  client: Client,
  { slug }: Pick<Team, 'slug'>
) {
  const body = await client.fetch<Team>(`/teams`, {
    method: 'POST',
    body: { slug },
  });
  return body;
}
