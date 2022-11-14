import { Team } from '../../types';
import Client from '../client';

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
