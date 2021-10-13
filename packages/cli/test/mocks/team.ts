import chance from 'chance';
import { client } from './client';
import { defaultUser } from './user';

export const defaultTeams = [
  {
    id: chance().guid(),
    slug: chance().string({ length: 5, casing: 'lower' }),
    name: chance().company(),
    creatorId: defaultUser.id,
    created: '2017-04-29T17:21:54.514Z',
    avatar: null,
  },
  {
    id: chance().guid(),
    slug: chance().string({ length: 5, casing: 'lower' }),
    name: chance().company(),
    creatorId: defaultUser.id,
    created: '2017-04-29T17:21:54.514Z',
    avatar: null,
  },
];

export function useTeams(teams = defaultTeams) {
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
