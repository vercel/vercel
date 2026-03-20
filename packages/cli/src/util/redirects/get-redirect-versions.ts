import type Client from '../client';

export interface RedirectVersion {
  id: string;
  lastModified: number;
  createdBy?: string;
  name?: string;
  isLive?: boolean;
  isStaging?: boolean;
  redirectCount?: number;
}

type Response = {
  versions: RedirectVersion[];
};

export default async function getRedirectVersions(
  client: Client,
  projectId: string,
  teamId?: string
) {
  const params = new URLSearchParams();
  params.set('projectId', projectId);

  if (teamId) {
    params.set('teamId', teamId);
  }

  const url = `/v1/bulk-redirects/versions?${params}`;
  return await client.fetch<Response>(url);
}
