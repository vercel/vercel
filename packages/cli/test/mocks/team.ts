import chance from 'chance';
import { client } from './client';
import { beforeEach } from 'vitest';
import { teamCache } from '../../src/util/teams/get-team-by-id-or-slug';
import assert from 'assert';
import { registerTeamRoutes } from './user-team-routes';
import type { Team, TeamRouteOptions } from './user-team-routes';

export type { Team } from './user-team-routes';

let teams: Team[] = [];

export function useTeams(
  teamId?: string,
  options: TeamRouteOptions = {
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

  registerTeamRoutes(client.scenario, teams, options);

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
  const newTeam = {
    id,
    slug: teamSlug,
    name: teamName,
    creatorId: chance().guid(),
    created: '2017-04-29T17:21:54.514Z',
    avatar: null,
  };
  teams.push(newTeam);
  return newTeam;
}

beforeEach(() => {
  teamCache.clear();
});
