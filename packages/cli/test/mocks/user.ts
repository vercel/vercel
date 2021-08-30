import chance from 'chance';
import { client } from './client';

export function useUser() {
  const userLimited = {
    uid: chance().guid(),
    email: chance().email(),
    name: chance().name(),
    username: chance().first().toLowerCase(),
  };

  client.scenario.get('/www/user', (_req, res) => {
    res.json({
      user: userLimited,
    });
  });

  return {
    ...userLimited,
  };
}
