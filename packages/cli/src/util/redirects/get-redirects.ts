import type Client from '../client';

export interface Redirect {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
  caseSensitive?: boolean;
  action?: '+' | '-';
}

export interface RedirectsPagination {
  count: number;
  numPages: number;
  page: number;
}

type Response = {
  redirects: Redirect[];
  pagination?: RedirectsPagination;
};

export interface GetRedirectsOptions {
  teamId?: string;
  search?: string;
  page?: number;
  perPage?: number;
  versionId?: string;
  diff?: boolean;
}

export default async function getRedirects(
  client: Client,
  projectId: string,
  options: GetRedirectsOptions = {}
) {
  const { teamId, search, page, perPage = 50, versionId, diff } = options;
  const params = new URLSearchParams();
  params.set('projectId', projectId);

  if (teamId) {
    params.set('teamId', teamId);
  }

  if (versionId) {
    params.set('versionId', versionId);
  }

  if (diff) {
    params.set('diff', 'true');
  } else {
    params.set('per_page', perPage.toString());

    if (search) {
      params.set('q', search);
    }

    if (page) {
      params.set('page', page.toString());
    }
  }

  const url = `/v1/bulk-redirects?${params}`;
  return await client.fetch<Response>(url);
}
