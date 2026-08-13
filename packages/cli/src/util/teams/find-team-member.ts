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
  pagination?: {
    count: number;
    next: number | null;
    prev: number | null;
  };
}

/**
 * Human-readable identity for a team member, preferring username, then email,
 * then the uid.
 */
export function memberIdentifier(member: TeamMember): string {
  return member.username || member.email || member.uid;
}

/**
 * Resolve a team member by uid, email, or username using the same public
 * members listing endpoint that `vercel teams members` uses. There is no
 * public get-member-by-identifier endpoint, so this pages through the list
 * until a match is found or the list is exhausted.
 */
export async function findTeamMember(
  client: Client,
  teamId: string,
  identifier: string
): Promise<TeamMember | null> {
  const needle = identifier.trim().toLowerCase();
  if (!needle) {
    return null;
  }

  let until: number | undefined;
  // Bound iterations so a large team can't produce an unbounded request loop.
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ limit: '100' });
    if (until) {
      query.set('until', String(until));
    }

    const { members, pagination } = await client.fetch<TeamMembersResponse>(
      `/v2/teams/${teamId}/members?${query}`
    );

    const match = (members || []).find(
      member =>
        member.uid?.toLowerCase() === needle ||
        member.email?.toLowerCase() === needle ||
        member.username?.toLowerCase() === needle
    );
    if (match) {
      return match;
    }

    if (!members || members.length === 0 || !pagination?.next) {
      return null;
    }
    until = pagination.next;
  }

  return null;
}
