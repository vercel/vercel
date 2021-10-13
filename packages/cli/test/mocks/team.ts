import chance from 'chance';
import { client } from './client';

export function useTeams() {
  const teams = [
    {
      id: chance().guid(),
      slug: chance().string({ length: 5, casing: 'lower' }),
      name: chance().company(),
      creatorId: chance().guid(),
      created: '2017-04-29T17:21:54.514Z',
      avatar: null,
    },
  ];

  for (let team of teams) {
    client.scenario.get(`/v1/team/${team.id}`, (_req, res) => {
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
