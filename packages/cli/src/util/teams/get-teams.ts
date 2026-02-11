import { URLSearchParams } from 'url';
import type Client from '../client';
import type { Team } from '@vercel-internals/types';
import { APIError, InvalidToken } from '../errors-ts';

export interface GetTeamsV1Options {
  apiVersion?: 1;
}

export interface GetTeamsV2Options {
  next?: number;
  limit?: number;
  apiVersion: 2;
}

export interface GetTeamsV2Response {
  teams: Team[];
  pagination: {
    count: number;
    next: number;
    prev: number;
  };
}

export default function getTeams(
  client: Client,
  opts?: GetTeamsV1Options
): Promise<Team[]>;
export default function getTeams(
  client: Client,
  opts: GetTeamsV2Options
): Promise<GetTeamsV2Response>;
export default async function getTeams(
  client: Client,
  opts: GetTeamsV1Options | GetTeamsV2Options = {}
): Promise<Team[] | GetTeamsV2Response> {
  const { apiVersion = 1 } = opts;

  let query = '';

  if (opts.apiVersion === 2) {
    // Enable pagination
    const params = new URLSearchParams({
      limit: String(typeof opts.limit === 'number' ? opts.limit : 20),
    });
    if (opts.next) {
      params.set('next', String(opts.next));
    }
    query = `?${params}`;
  }

  try {
    const body = await client.fetch<GetTeamsV2Response>(
      `/v${apiVersion}/teams${query}`,
      {
        useCurrentTeam: false,
      }
    );
    if (apiVersion === 1) {
      return body.teams || [];
    }
    return body;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken(client.authConfig.tokenSource);
    }
    throw error;
  }
}
