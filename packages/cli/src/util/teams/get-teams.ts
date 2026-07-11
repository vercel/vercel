import { URLSearchParams } from 'url';
import type Client from '../client';
import type { Team } from '@vercel-internals/types';
import { APIError, InvalidToken } from '../errors-ts';
import { teamCache } from './get-team-by-id';

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

  if (apiVersion === 1) {
    if (client.teams) {
      return client.teams;
    }

    if (client.teamsPromise) {
      return client.teamsPromise;
    }

    client.teamsPromise = fetchTeams(client, opts).then(result => {
      const teams = Array.isArray(result) ? result : result.teams;
      client.teams = teams;
      return teams;
    });

    try {
      return await client.teamsPromise;
    } finally {
      client.teamsPromise = undefined;
    }
  }

  return fetchTeams(client, opts);
}

async function fetchTeams(
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
      const teams = body.teams || [];
      for (const team of teams) {
        teamCache.set(team.id, team);
      }
      return teams;
    }
    return body;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken(client.authConfig.tokenSource);
    }
    throw error;
  }
}
