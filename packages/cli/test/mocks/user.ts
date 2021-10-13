import chance from 'chance';
import { client } from './client';

export function useUser() {
  const userLimited = {
    id: chance().guid(),
    email: chance().email(),
    name: chance().name(),
    username: chance().first().toLowerCase(),
  };

  client.scenario.get('/v2/user', (_req, res) => {
    res.json({
      user: userLimited,
    });
  });

  return {
    ...userLimited,
  };
}
