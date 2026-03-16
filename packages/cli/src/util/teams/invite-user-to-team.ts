import type Client from '../client';
import type { TeamMemberRole } from './team-member-roles';

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
  role?: TeamMemberRole
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
