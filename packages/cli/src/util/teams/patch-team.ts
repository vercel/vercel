import { Team } from '../../types';
import Client from '../client';

export default async function patchTeam(
  client: Client,
  teamId: string,
  payload: Partial<Pick<Team, 'name' | 'slug'>>
) {
  const body = await client.fetch<Team>(
    `/teams/${encodeURIComponent(teamId)}`,
    {
      method: 'PATCH',
      body: payload,
    }
  );
  return body;
}
