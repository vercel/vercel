import type Client from '../client';
import type { AccessGroup } from './types';

export default async function createAccessGroup(
  client: Client,
  name: string
): Promise<AccessGroup> {
  return client.fetch<AccessGroup>('/v1/access-groups', {
    method: 'POST',
    body: { name },
  });
}
