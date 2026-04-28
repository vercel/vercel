import chance from 'chance';
import { client } from './client';
import { beforeEach } from 'vitest';
import { teamCache } from '../../src/util/teams/get-team-by-id';
import assert from 'assert';

export type Team = {
  id: string;
  slug: string;
  name: string;
  creatorId: string;
  created: string;
  avatar: null;
  billing: {
    addons: string[];
    plan: string;
    platform: string;
    status: 'active';
    period: { start: number; end: number };
    trial: { start: number; end: number };
  };
};

let teams: Team[] = [];

export interface UseTeamsOptions {
  failMissingToken?: boolean;
  failInvalidToken?: boolean;
  failNoAccess?: boolean;
  failWithCustom403Code?: boolean;
  apiVersion?: number;
}

export function useTeams(
  teamId?: string,
  options?: UseTeamsOptions
): Team[] | { teams: Team[] };

export function useTeams(
  teamId?: string,
  options: UseTeamsOptions = {
    failMissingToken: false,
    failInvalidToken: false,
    failNoAccess: false,
    failWithCustom403Code: false,
    apiVersion: 1,
  }
) {
  // intentionally blow away accrued teams added by `createTeam`
  teams = [];

  createTeam(teamId);

  for (const team of teams) {
    client.scenario.get(`/teams/${team.id}`, (_req, res) => {
      if (options.failMissingToken) {
        res.statusCode = 403;
        res.json({
          message: 'The request is missing an authentication token',
          code: 'forbidden',
          missingToken: true,
        });
        return;
      }
      if (options.failInvalidToken) {
        res.statusCode = 403;
        res.json({
          message: 'Not authorized',
          code: 'forbidden',
          invalidToken: true,
        });
        return;
      }

      if (options.failNoAccess) {
        res.statusCode = 403;
        res.send({
          code: 'team_unauthorized',
          message: 'You are not authorized',
        });
        return;
      }

      if (options.failWithCustom403Code) {
        res.statusCode = 403;
        res.send({
          code: 'custom_error_code',
          message: 'You are not authorized to read this team.',
        });
        return;
      }

      res.json(team);
    });
  }

  client.scenario.get(`/v${options.apiVersion}/teams`, (_req, res) => {
    res.json({
      teams,
    });
  });

  return options.apiVersion === 2 ? { teams } : teams;
}

export function useTeam(teamId?: string) {
  const teams = useTeams(teamId);
  assert(Array.isArray(teams));
  return teams[0];
}

export function createTeam(teamId?: string, slug?: string, name?: string) {
  const id = teamId || chance().guid();
  const teamSlug = slug || chance().string({ length: 5, casing: 'lower' });
  const teamName = name || chance().company();
  const now = Date.now();
  const newTeam: Team = {
    id,
    slug: teamSlug,
    name: teamName,
    creatorId: chance().guid(),
    created: '2017-04-29T17:21:54.514Z',
    avatar: null,
    billing: {
      addons: [],
      plan: 'pro',
      platform: 'stripe',
      status: 'active',
      period: { start: now, end: now + 30 * 24 * 60 * 60 * 1000 },
      trial: { start: now, end: now + 14 * 24 * 60 * 60 * 1000 },
    },
  };
  teams.push(newTeam);
  return newTeam;
}

beforeEach(() => {
  teamCache.clear();
});
