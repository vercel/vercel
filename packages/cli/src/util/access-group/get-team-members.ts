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
  };
}

// Pages through the team members endpoint so a member can be resolved by uid,
// email, or username.
export default async function getTeamMembers(
  client: Client,
  teamId: string
): Promise<TeamMember[]> {
  const members: TeamMember[] = [];
  let until: number | undefined;

  do {
    const query = new URLSearchParams({ limit: '100' });
    if (until) {
      query.set('until', String(until));
    }
    const response = await client.fetch<TeamMembersResponse>(
      `/v2/teams/${encodeURIComponent(teamId)}/members?${query.toString()}`
    );
    members.push(...(response.members ?? []));
    until = response.pagination?.next ?? undefined;
  } while (until);

  return members;
}
