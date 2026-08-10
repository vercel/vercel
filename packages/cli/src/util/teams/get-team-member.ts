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
  pagination: {
    count: number;
    next: number | null;
    prev: number | null;
  };
}

/** Human label for a member, preferring the handle over the raw id. */
export function teamMemberLabel(member: TeamMember): string {
  return member.username || member.email || member.uid;
}

/**
 * Resolve a team member by uid, email, or username (case-insensitive), paging
 * through the roster. Returns null when no member matches so callers can render
 * their own not-found message.
 */
export async function getTeamMemberByIdentifier(
  client: Client,
  teamId: string,
  identifier: string
): Promise<TeamMember | null> {
  const needle = identifier.toLowerCase();
  let until: number | undefined;

  do {
    const query = new URLSearchParams({ limit: '100' });
    if (until) {
      query.set('until', String(until));
    }
    const { members, pagination } = await client.fetch<TeamMembersResponse>(
      `/v2/teams/${encodeURIComponent(teamId)}/members?${query}`
    );
    const match = (members ?? []).find(
      member =>
        member.uid === identifier ||
        member.email?.toLowerCase() === needle ||
        member.username?.toLowerCase() === needle
    );
    if (match) {
      return match;
    }
    until = pagination?.next ?? undefined;
  } while (until);

  return null;
}
