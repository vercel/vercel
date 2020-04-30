import { Output } from '../output';
import Client from '../client';
import { ProjectEnvVariable, ProjectEnvTarget } from '../../types';

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  target?: ProjectEnvTarget
): Promise<ProjectEnvVariable[]> {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const qs = target ? `?target=${encodeURIComponent(target)}` : '';
  const url = `/v4/projects/${projectId}/env${qs}`;
  const records = await client.fetch<ProjectEnvVariable[]>(url);
  return records;
}
