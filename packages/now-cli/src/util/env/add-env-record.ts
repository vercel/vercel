import { Output } from '../output';
import Client from '../client';
import { Secret, ProjectEnvTarget, ProjectEnvVariableV5 } from '../../types';

export default async function addEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  type: 'plain' | 'secret' | 'system',
  envName: string,
  envValue: string,
  targets: ProjectEnvTarget[]
): Promise<void> {
  output.debug(
    `Adding ${type} Environment Variable ${envName} to ${targets.length} targets`
  );

  let value = envValue;

  if (type === 'secret') {
    const secret = await client.fetch<Secret>(
      `/v2/now/secrets/${encodeURIComponent(envValue)}`
    );
    value = secret.uid;
  }

  const body = { type, key: envName, value, target: targets };

  const urlProject = `/v6/projects/${projectId}/env`;
  await client.fetch<ProjectEnvVariableV5>(urlProject, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
