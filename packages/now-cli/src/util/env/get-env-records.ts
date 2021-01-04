import { Output } from '../output';
import Client from '../client';
import { ProjectEnvVariable, ProjectEnvTarget } from '../../types';
import { URLSearchParams } from 'url';

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  target?: ProjectEnvTarget
) {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const query = new URLSearchParams();

  if (target) {
    query.set('target', target);
  }

  const url = `/v6/projects/${projectId}/env?${query}`;

  return client.fetch<{ envs: ProjectEnvVariable[] }>(url);
}
