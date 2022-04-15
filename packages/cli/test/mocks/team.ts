import chance from 'chance';
import { client } from './client';

export function useTeams(teamId?: string) {
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
