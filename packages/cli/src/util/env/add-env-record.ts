import { Output } from '../output';
import Client from '../client';
import {
  ProjectEnvTarget,
  ProjectEnvVariable,
  ProjectEnvType,
} from '../../types';

export default async function addEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  type: ProjectEnvType,
  key: string,
  value: string,
  targets: ProjectEnvTarget[],
  gitBranch: string
): Promise<void> {
  output.debug(
    `Adding ${type} Environment Variable ${key} to ${targets.length} targets`
  );
  const body: Omit<ProjectEnvVariable, 'id'> = {
    type,
    key,
    value,
    target: targets,
    gitBranch: gitBranch || undefined,
  };
  const url = `/v7/projects/${projectId}/env`;
  await client.fetch<ProjectEnvVariable>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
