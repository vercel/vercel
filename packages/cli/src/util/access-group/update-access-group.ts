import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { AccessGroup } from './types';

export interface UpdateAccessGroupBody {
  name?: string;
  membersToAdd?: string[];
  membersToRemove?: string[];
}

export default async function updateAccessGroup(
  client: Client,
  idOrName: string,
  body: UpdateAccessGroupBody
): Promise<AccessGroup> {
  return client.fetch<AccessGroup>(
    `/v1/access-groups/${encodeURIComponent(idOrName)}`,
    {
      method: 'POST',
      body: { ...body } as JSONObject,
    }
  );
}
