import chance from 'chance';
import { client } from './client';

export function useTeams(
  teamId?: string,
  options: {
    failMissingToken?: boolean;
    failNoAccess?: boolean;
  } = {
    failMissingToken: false,
    failNoAccess: false,
  }
) {
  const id = teamId || chance().guid();
  const teams = [
    {
      id,
      slug: chance().string({ length: 5, casing: 'lower' }),
      name: chance().company(),
      creatorId: chance().guid(),
      created: '2017-04-29T17:21:54.514Z',
      avatar: null,
    },
  ];

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

  client.scenario.get('/v1/teams', (_req, res) => {
    res.json({
      teams,
    });
  });

  return teams;
}
