import chance from 'chance';
import { client } from './client';
import { beforeEach } from 'vitest';
import { teamCache } from '../../src/util/teams/get-team-by-id-or-slug';
import assert from 'assert';

export type Team = {
  id: string;
  slug: string;
  name: string;
  creatorId: string;
  created: string;
  avatar: null;
  /** Only set when a test asks for one; the API always sends it. */
  billing?: { plan: string };
};

let teams: Team[] = [];

export function useTeams(
  teamId?: string,
  options: {
    failMissingToken?: boolean;
    failInvalidToken?: boolean;
    failNoAccess?: boolean;
    failWithCustom403Code?: boolean;
    apiVersion?: number;
    /** Billing plan on the team, for the code paths gated on it. */
    billingPlan?: string;
  } = {
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
  if (options.billingPlan) {
    setTeamBillingPlan(options.billingPlan);
  }

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

/**
 * Set the billing plan on the teams already mocked.
 *
 * `client.scenario` is an express Router, so re-registering `/teams/:id` adds
 * a second handler the first one shadows: a test cannot swap the team after
 * `useTeams` has run, only mutate the object the handler closed over.
 */
export function setTeamBillingPlan(plan: string) {
  for (const team of teams) {
    team.billing = { plan };
  }
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
