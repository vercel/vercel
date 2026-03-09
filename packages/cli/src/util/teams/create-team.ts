import type { Team } from '@vercel-internals/types';
import type Client from '../client';

export default async function createTeam(
  client: Client,
  { slug }: Pick<Team, 'slug'>,
  opts?: { signal?: AbortSignal; bailOn429?: boolean }
) {
  const body = await client.fetch<Team>(`/teams`, {
    method: 'POST',
    body: { slug },
    useCurrentTeam: false,
    ...(opts?.signal && { signal: opts.signal }),
    bailOn429: true,
  });
  return body;
}
