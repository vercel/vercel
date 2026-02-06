import { PROJECT_ENV_TARGET } from '@vercel-internals/constants';
import type {
  ProjectEnvTarget,
  ProjectEnvType,
  ProjectEnvVariable,
} from '@vercel-internals/types';
import output from '../../output-manager';
import type Client from '../client';

export default async function addEnvRecord(
  client: Client,
  projectId: string,
  upsert: string,
  type: ProjectEnvType,
  key: string,
  value: string,
  targets: string[],
  gitBranch: string
): Promise<void> {
  const actionWord = upsert ? 'Overriding' : 'Adding';
  output.debug(
    `${actionWord} ${type} Environment Variable ${key} to ${targets.length} targets`
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
  const args = upsert ? `?upsert=${upsert}` : '';
  const url = `/v10/projects/${projectId}/env${args}`;
  await client.fetch(url, {
    method: 'POST',
    body,
  });
}
