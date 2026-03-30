import type Client from '../client';
import type { RedirectVersion } from './get-redirect-versions';

type Response = {
  alias?: string;
  version: RedirectVersion;
};

export default async function deleteRedirects(
  client: Client,
  projectId: string,
  sources: string[],
  teamId?: string
) {
  const params = new URLSearchParams();
  params.set('projectId', projectId);

  if (teamId) {
    params.set('teamId', teamId);
  }

  const url = `/v1/bulk-redirects?${params}`;
  return await client.fetch<Response>(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      redirects: sources,
    }),
  });
}
