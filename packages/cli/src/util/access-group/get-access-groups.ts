import type Client from '../client';
import type { AccessGroup, ListAccessGroupsResponse } from './types';

// Pages through the public list endpoint so the CLI returns every access group
// on the team, not just the first page.
export default async function getAccessGroups(
  client: Client
): Promise<AccessGroup[]> {
  const accessGroups: AccessGroup[] = [];
  let next: string | undefined;

  do {
    const query = new URLSearchParams({ limit: '100' });
    if (next) {
      query.set('next', next);
    }
    const response = await client.fetch<ListAccessGroupsResponse>(
      `/v1/access-groups?${query.toString()}`
    );
    accessGroups.push(...(response.accessGroups ?? []));
    next = response.pagination?.next ?? undefined;
  } while (next);

  return accessGroups;
}
