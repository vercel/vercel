import chance from 'chance';
import { client } from './client';
import type { User } from '@vercel-internals/types';
import { registerUserRoutes } from './user-team-routes';

export function useUser(additionalAttrs: Partial<User> = {}) {
  const user = {
    id: chance().guid(),
    email: chance().email(),
    name: chance().name(),
    username: chance().first({ nationality: 'en' }).toLowerCase(),
    ...additionalAttrs,
  };
  registerUserRoutes(client.scenario, user);

  return user;
}
