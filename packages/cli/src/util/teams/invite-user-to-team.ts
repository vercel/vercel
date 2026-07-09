import type Client from '../client';

// Keep in sync with the `role` enum for POST /v2/teams/{teamId}/members.
export const TEAM_ROLES = [
  'OWNER',
  'MEMBER',
  'DEVELOPER',
  'SECURITY',
  'BILLING',
  'VIEWER',
  'VIEWER_FOR_PLUS',
  'CONTRIBUTOR',
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export function isTeamRole(value: string): value is TeamRole {
  return TEAM_ROLES.some(role => role === value);
}

interface InviteResponse {
  uid: string;
  username: string;
  email: string;
  role: string;
}

export default async function inviteUserToTeam(
  client: Client,
  teamId: string,
  email: string,
  role?: TeamRole
) {
  const body = await client.fetch<InviteResponse>(
    `/teams/${encodeURIComponent(teamId)}/members`,
    {
      method: 'POST',
      body: role ? { email, role } : { email },
    }
  );
  return body;
}
