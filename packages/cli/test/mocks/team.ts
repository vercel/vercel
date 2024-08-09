import chance from 'chance';
import { client } from './client';

type Team = {
  id: string;
  slug: string;
  name: string;
  creatorId: string;
  created: string;
  avatar: null;
};

let teams: Team[] = [];

export function useTeams(
  teamId?: string,
  options: {
    failMissingToken?: boolean;
    failInvalidToken?: boolean;
    failNoAccess?: boolean;
    apiVersion?: number;
  } = {
    failMissingToken: false,
    failInvalidToken: false,
    failNoAccess: false,
    apiVersion: 1,
  }
) {
  // intentionally blow away accrued teams added by `createTeam`
  teams = [];

  createTeam(teamId);

  for (let team of teams) {
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

export function createTeam(teamId?: string) {
  const id = teamId || chance().guid();
  const newTeam = {
    id,
    slug: chance().string({ length: 5, casing: 'lower' }),
    name: chance().company(),
    creatorId: chance().guid(),
    created: '2017-04-29T17:21:54.514Z',
    avatar: null,
  };
  teams.push(newTeam);
  return newTeam;
}
