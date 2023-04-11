import { Output } from '../output';
import Client from '../client';
import type {
  PROJECT_ENV_TARGET_VALUES,
  ProjectEnvVariable,
  PROJECT_ENV_TYPE_VALUES,
} from '@vercel-internals/types';

export default async function addEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  type: PROJECT_ENV_TYPE_VALUES,
  key: string,
  value: string,
  targets: PROJECT_ENV_TARGET_VALUES[],
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
  const url = `/v8/projects/${projectId}/env`;
  await client.fetch(url, {
    method: 'POST',
    body,
  });
}
