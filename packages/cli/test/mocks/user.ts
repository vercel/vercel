import chance from 'chance';
import { client } from './client';

export const defaultUser = {
  uid: chance().guid(),
  email: chance().email(),
  name: chance().name(),
  username: chance().first().toLowerCase(),
};

export function useUser(user = defaultUser) {
  client.scenario.get('/www/user', (_req, res) => {
    res.json({
      user,
    });
  });

  return {
    ...user,
  };
}
