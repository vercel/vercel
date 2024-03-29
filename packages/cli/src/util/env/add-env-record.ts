import { Output } from '../output';
import Client from '../client';
import type {
  ProjectEnvTarget,
  ProjectEnvVariable,
  ProjectEnvType,
} from '@vercel-internals/types';

export default async function addEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  upsert: string,
  type: ProjectEnvType,
  key: string,
  value: string,
  targets: ProjectEnvTarget[],
  gitBranch: string
): Promise<void> {
  const actionWord = upsert ? 'Overriding' : 'Adding';
  output.debug(
    `${actionWord} ${type} Environment Variable ${key} to ${targets.length} targets`
  );
  const body: Omit<ProjectEnvVariable, 'id'> = {
    type,
    key,
    value,
    target: targets,
    gitBranch: gitBranch || undefined,
  };
  const args = upsert ? `?upsert=${upsert}` : '';
  const version = upsert ? 'v10' : 'v8';
  const url = `/${version}/projects/${projectId}/env${args}`;
  await client.fetch(url, {
    method: 'POST',
    body,
  });
}
