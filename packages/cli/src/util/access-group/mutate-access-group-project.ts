import type Client from '../client';
import type { AccessGroupProject, AccessGroupProjectRole } from './types';

export function createAccessGroupProject(
  client: Client,
  group: string,
  projectId: string,
  role: AccessGroupProjectRole
): Promise<AccessGroupProject> {
  return client.fetch<AccessGroupProject>(
    `/v1/access-groups/${encodeURIComponent(group)}/projects`,
    {
      method: 'POST',
      body: { projectId, role },
    }
  );
}

export function updateAccessGroupProject(
  client: Client,
  group: string,
  projectId: string,
  role: AccessGroupProjectRole
): Promise<AccessGroupProject> {
  return client.fetch<AccessGroupProject>(
    `/v1/access-groups/${encodeURIComponent(group)}/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: { role },
    }
  );
}

export async function deleteAccessGroupProject(
  client: Client,
  group: string,
  projectId: string
): Promise<void> {
  await client.fetch(
    `/v1/access-groups/${encodeURIComponent(group)}/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'DELETE',
    }
  );
}
