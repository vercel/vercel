import type Client from '../client';

interface DeleteDraftOptions {
  teamId?: string;
}

export default async function deleteFirewallDraft(
  client: Client,
  projectId: string,
  options: DeleteDraftOptions = {}
): Promise<void> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/config/draft?${query.toString()}`;
  await client.fetch(url, {
    method: 'DELETE',
  });
}
