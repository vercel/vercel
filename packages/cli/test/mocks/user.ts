import chance from 'chance';
import { client } from './client';
import type { User } from '@vercel-internals/types';

export function useUser(additionalAttrs: Partial<User> = {}) {
  delete additionalAttrs.version;

  const user = {
    id: chance().guid(),
    email: chance().email(),
    name: chance().name(),
    username: chance().first().toLowerCase(),
    version: 'northstar',
    ...additionalAttrs,
  };
  client.scenario.get('/v2/user', (_req, res) => {
    res.json({
      user,
    });
  });

  client.scenario.post('/registration', (_req, res) => {
    res.json({
      token: 'T1dmvPu36nmyYisXAs7IRzcR',
      securityCode: 'Practical Saola',
    });
  });

  client.scenario.get('/registration/verify', (_req, res) => {
    res.json({
      token: 'hjkjn',
      email: user.email,
    });
  });

  return user;
}
