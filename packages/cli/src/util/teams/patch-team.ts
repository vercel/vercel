import type { Team } from '@vercel-internals/types';
import type Client from '../client';

export default async function patchTeam(
  client: Client,
  teamId: string,
  payload: Partial<Pick<Team, 'name' | 'slug'>>
): Promise<Team> {
  const body = await client.fetch<Team>(
    `/teams/${encodeURIComponent(teamId)}`,
    {
      method: 'PATCH',
      body: payload,
    }
  );
  // fetch() returns Response when response is not application/json; PATCH /teams should return JSON
  if (body && typeof body === 'object' && 'ok' in body) {
    throw new Error('PATCH /teams returned non-JSON response');
  }
  return body as Team;
}
