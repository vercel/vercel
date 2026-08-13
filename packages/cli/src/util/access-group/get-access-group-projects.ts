import type Client from '../client';
import type {
  AccessGroupProject,
  ListAccessGroupProjectsResponse,
} from './types';

// Pages through the public projects endpoint so callers see every project in
// the access group.
export default async function getAccessGroupProjects(
  client: Client,
  idOrName: string
): Promise<AccessGroupProject[]> {
  const projects: AccessGroupProject[] = [];
  let next: string | undefined;

  do {
    const query = new URLSearchParams({ limit: '100' });
    if (next) {
      query.set('next', next);
    }
    const response = await client.fetch<ListAccessGroupProjectsResponse>(
      `/v1/access-groups/${encodeURIComponent(idOrName)}/projects?${query.toString()}`
    );
    projects.push(...(response.projects ?? []));
    next = response.pagination?.next ?? undefined;
  } while (next);

  return projects;
}
