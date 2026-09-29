import type Client from './client';
import type { User } from '@vercel-internals/types';
import { scopeContextFromClient } from '../gateways/live-context';
import { loadCurrentUser } from './scope/resolve-scope';

/**
 * Legacy entry point for loading the current user. Builds live gateways from
 * `client` and delegates to `loadCurrentUser`.
 */
export default async function getUser(client: Client): Promise<User> {
  return loadCurrentUser(scopeContextFromClient(client), client);
}
