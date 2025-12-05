import type Client from '../client';
import type { RedirectVersion } from './get-redirect-versions';

export interface RedirectInput {
  source: string;
  destination: string;
  statusCode: number;
  caseSensitive: boolean;
}

type Response = {
  alias?: string;
  version: RedirectVersion;
};

export default async function putRedirects(
  client: Client,
  projectId: string,
  redirects: RedirectInput[],
  teamId?: string,
  name?: string
) {
  const url = `/v1/bulk-redirects`;

  const body: any = {
    projectId,
    redirects,
  };

  if (teamId) {
    body.teamId = teamId;
  }

  if (name) {
    body.name = name;
  }

  return await client.fetch<Response>(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
