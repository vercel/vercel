import type Client from '../client';
import type { RedirectVersion } from './get-redirect-versions';

type Response = {
  version: RedirectVersion;
};

export default async function updateRedirectVersion(
  client: Client,
  projectId: string,
  versionId: string,
  action: 'promote' | 'restore',
  teamId?: string
) {
  const params = new URLSearchParams();
  params.set('projectId', projectId);

  if (teamId) {
    params.set('teamId', teamId);
  }

  const url = `/v1/bulk-redirects/versions?${params}`;
  return await client.fetch<Response>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: versionId,
      action,
    }),
  });
}
