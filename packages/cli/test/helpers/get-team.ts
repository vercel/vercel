import retry from 'async-retry';
import { apiFetch } from './api-fetch';
import type { Team } from '@vercel-internals/types';

export function getTeamInfo(retries = 3): Promise<Team> {
  const url = `/v2/teams/${process.env.VERCEL_TEAM_ID}`;

  return retry(
    async () => {
      const res = await apiFetch(url);

      if (!res.ok) {
        throw new Error(
          `Failed to fetch "${url}", status: ${
            res.status
          }, id: ${res.headers.get('x-vercel-id')}`
        );
      }

      const data = await res.json();

      return data;
    },
    { retries, factor: 1 }
  );
}
