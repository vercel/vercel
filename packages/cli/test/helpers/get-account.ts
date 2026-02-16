import retry from 'async-retry';
import { apiFetch } from './api-fetch';
import type { Team, User } from '@vercel-internals/types';

export function getUser(retries = 3): Promise<User> {
  const url = `/v2/user`;

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

      const data = (await res.json()) as Record<string, any>;

      return data.user;
    },
    { retries, factor: 1 }
  );
}

export function getTeam(retries = 3): Promise<Team> {
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

      return (await res.json()) as Team;
    },
    { retries, factor: 1 }
  );
}

export const userPromise = getUser();

export const teamPromise = getTeam();
