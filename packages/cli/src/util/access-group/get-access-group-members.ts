import type Client from '../client';
import type {
  AccessGroupMember,
  ListAccessGroupMembersResponse,
} from './types';

// Pages through the public members endpoint so callers see every member of the
// access group.
export default async function getAccessGroupMembers(
  client: Client,
  idOrName: string
): Promise<AccessGroupMember[]> {
  const members: AccessGroupMember[] = [];
  let next: string | undefined;

  do {
    const query = new URLSearchParams({ limit: '100' });
    if (next) {
      query.set('next', next);
    }
    const response = await client.fetch<ListAccessGroupMembersResponse>(
      `/v1/access-groups/${encodeURIComponent(idOrName)}/members?${query.toString()}`
    );
    members.push(...(response.members ?? []));
    next = response.pagination?.next ?? undefined;
  } while (next);

  return members;
}
