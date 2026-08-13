import type Client from '../client';
import type { AccessGroup } from './types';

export default async function getAccessGroup(
  client: Client,
  idOrName: string
): Promise<AccessGroup> {
  return client.fetch<AccessGroup>(
    `/v1/access-groups/${encodeURIComponent(idOrName)}`
  );
}
