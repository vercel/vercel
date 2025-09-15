import type Client from '../client';
import type { Project, ProjectSettings } from '@vercel-internals/types';

export default async function createProject(
  client: Client,
  settings: ProjectSettings & { name: string; vercelAuth?: 'none' | 'standard' }
) {
  const { vercelAuth, ...rest } = settings;
  const project = await client.fetch<Project>('/v1/projects', {
    method: 'POST',
    body: {
      ...rest,
      /**
       * If `null`, vercel auth is disabled. Otherwise standard protection is enabled.
       * vercelAuth used to be called ssoProtection.
       */
      ...(vercelAuth === 'none' ? { ssoProtection: null } : undefined),
    },
  });
  return project;
}
