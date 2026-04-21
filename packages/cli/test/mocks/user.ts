import chance from 'chance';
import { client } from './client';
import type { User } from '@vercel-internals/types';

function createBilling(plan = 'hobby'): User['billing'] {
  return {
    addons: [],
    period: { start: 0, end: 0 },
    plan,
    platform: 'stripe',
    status: 'active',
    trial: { start: 0, end: 0 },
  };
}

export function useUser(additionalAttrs: Partial<User> = {}) {
  const user = {
    id: chance().guid(),
    email: chance().email(),
    name: chance().name(),
    username: chance().first({ nationality: 'en' }).toLowerCase(),
    billing: createBilling(),
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
