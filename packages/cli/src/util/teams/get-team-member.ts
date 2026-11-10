import type Client from '../client';

export interface TeamMember {
  uid: string;
  email?: string;
  username?: string;
  name?: string;
  role?: string;
}

interface TeamMembersResponse {
  members: TeamMember[];
}

const UIDS_PER_REQUEST = 20;

export function teamMemberLabel(member: TeamMember): string {
  return member.username || member.email || member.uid;
}

function fetchMembers(
  client: Client,
  teamId: string,
  opts: { search?: string; userIds?: string[] }
): Promise<TeamMember[]> {
  const query = new URLSearchParams({ limit: '100' });
  if (opts.search) {
    query.set('search', opts.search);
  }
  for (const id of opts.userIds ?? []) {
    query.append('filterByUserIds', id);
  }
  return client
    .fetch<TeamMembersResponse>(
      `/v2/teams/${encodeURIComponent(teamId)}/members?${query}`
    )
    .then(res => res.members ?? []);
}

/** Resolve a member by email, username, or uid without crawling the roster. */
export async function getTeamMemberByIdentifier(
  client: Client,
  teamId: string,
  identifier: string
): Promise<TeamMember | null> {
  const needle = identifier.toLowerCase();
  const searched = await fetchMembers(client, teamId, { search: identifier });
  const match = searched.find(
    member =>
      member.uid === identifier ||
      member.email?.toLowerCase() === needle ||
      member.username?.toLowerCase() === needle
  );
  if (match) {
    return match;
  }
  const byId = await fetchMembers(client, teamId, { userIds: [identifier] });
  return byId.find(member => member.uid === identifier) ?? null;
}

export async function getTeamMembersByIds(
  client: Client,
  teamId: string,
  uids: string[]
): Promise<Map<string, TeamMember>> {
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += UIDS_PER_REQUEST) {
    chunks.push(uids.slice(i, i + UIDS_PER_REQUEST));
  }
  const pages = await Promise.all(
    chunks.map(userIds => fetchMembers(client, teamId, { userIds }))
  );
  return new Map(pages.flat().map(member => [member.uid, member]));
}
