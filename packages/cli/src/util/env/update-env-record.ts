import type Client from '../client';
import type {
  ProjectEnvTarget,
  ProjectEnvVariable,
  ProjectEnvType,
} from '@vercel-internals/types';
import { PROJECT_ENV_TARGET } from '@vercel-internals/constants';
import output from '../../output-manager';

export default async function updateEnvRecord(
  client: Client,
  projectId: string,
  envId: string,
  type: ProjectEnvType,
  key: string,
  value: string,
  targets: string[],
  gitBranch: string
): Promise<void> {
  output.debug(
    `Updating ${type} Environment Variable ${key} in ${targets.length} targets`
  );
  const target: ProjectEnvTarget[] = [];
  const customEnvironmentIds: string[] = [];
  for (const t of targets) {
    const arr = PROJECT_ENV_TARGET.includes(t as ProjectEnvTarget)
      ? target
      : customEnvironmentIds;
    arr.push(t);
  }
  const body: Omit<ProjectEnvVariable, 'id'> = {
    type,
    key,
    value,
    target,
    customEnvironmentIds:
      customEnvironmentIds.length > 0 ? customEnvironmentIds : undefined,
    gitBranch: gitBranch || undefined,
  };
  const url = `/v10/projects/${projectId}/env/${envId}`;
  await client.fetch(url, {
    method: 'PATCH',
    body,
  });
}
