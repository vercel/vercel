import type Client from '../client';
import type { Project, ProjectSettings } from '@vercel-internals/types';

export default async function createProject(
  client: Client,
  settings: ProjectSettings & {
    name: string;
    v0?: boolean;
  }
) {
  const { v0, ...rest } = settings;
  const project = await client.fetch<Project>('/v1/projects', {
    method: 'POST',
    body: {
      ...rest,
      ...(v0 ? { v0: true } : undefined),
    },
  });
  return project;
}
