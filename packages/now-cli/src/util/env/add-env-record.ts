import { Output } from '../output';
import Client from '../client';
import {
  Secret,
  ProjectEnvTarget,
  ProjectEnvVariableV5,
  ProjectEnvType,
} from '../../types';

export default async function addEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  type: ProjectEnvType,
  key: string,
  envValue: string,
  targets: ProjectEnvTarget[]
): Promise<void> {
  output.debug(
    `Adding ${type} Environment Variable ${key} to ${targets.length} targets`
  );

  let value = envValue;

  if (type === ProjectEnvType.Secret) {
    const secret = await client.fetch<Secret>(
      `/v2/now/secrets/${encodeURIComponent(envValue)}`
    );
    value = secret.uid;
  }

  const body = { type, key, value, target: targets };

  const urlProject = `/v6/projects/${projectId}/env`;
  await client.fetch<ProjectEnvVariableV5>(urlProject, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
