import Client from '../client';
import { Project } from '../../types';

export default async function getProjectByNameOrId(
  client: Client,
  projectNameOrId: string
) {
  const project = await client.fetch<Project>(`/projects/${encodeURIComponent(projectNameOrId)}`);
  return project;
}
