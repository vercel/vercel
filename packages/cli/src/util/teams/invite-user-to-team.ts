import Client from '../client';

interface InviteResponse {
  uid: string;
  username: string;
  email: string;
  role: string;
}

export default async function inviteUserToTeam(
  client: Client,
  teamId: string,
  email: string
) {
  const body = await client.fetch<InviteResponse>(
    `/teams/${encodeURIComponent(teamId)}/members`,
    {
      method: 'POST',
      body: { email },
    }
  );
  return body;
}
