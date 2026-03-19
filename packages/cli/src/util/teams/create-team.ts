import type { Team } from '@vercel-internals/types';
import type Client from '../client';
import type { FetchOptions } from '../client';

export default async function createTeam(
  client: Client,
  { slug }: Pick<Team, 'slug'>,
  opts?: { signal?: AbortSignal; bailOn429?: boolean }
) {
  const fetchOpts: FetchOptions = {
    method: 'POST',
    body: { slug },
    useCurrentTeam: false,
    bailOn429: true,
  };
  // node-fetch FetchOptions.signal uses a different AbortSignal type than global; assign via cast.
  if (opts?.signal) {
    fetchOpts.signal = opts.signal as FetchOptions['signal'];
  }
  const body = await client.fetch<Team>(`/teams`, fetchOpts);
  return body;
}
