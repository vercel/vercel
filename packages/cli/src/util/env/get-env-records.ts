import { Output } from '../output';
import Client from '../client';
import { ProjectEnvVariable, ProjectEnvTarget } from '../../types';
import { URLSearchParams } from 'url';

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  {
    key,
    target,
    gitBranch,
    decrypt,
  }: {
    key?: string;
    target?: ProjectEnvTarget | string;
    gitBranch?: string;
    decrypt?: boolean;
  } = {}
) {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const query = new URLSearchParams();

  if (key) {
    query.set('key', key);
  }
  if (target) {
    query.set('target', target);
  }
  if (gitBranch) {
    query.set('gitBranch', gitBranch);
  }
  if (decrypt) {
    query.set('decrypt', decrypt.toString());
  }

  const url = `/v7/projects/${projectId}/env?${query}`;

  return client.fetch<{ envs: ProjectEnvVariable[] }>(url);
}
