import Client from '../client';
import { Project } from '../../types';

export default async function createProject(
  client: Client,
  projectName: string
) {
  const project = await client.fetch<Project>('/v1/projects', {
    method: 'POST',
    body: JSON.stringify({ name: projectName }),
  });
  return project;
}
