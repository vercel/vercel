import { Output } from '../output';
import Client from '../client';
import { Secret, ProjectEnvTarget, ProjectEnvVariable } from '../../types';
import { customAlphabet } from 'nanoid';
import slugify from '@sindresorhus/slugify';

export default async function addEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  envName: string,
  envValue: string,
  targets: ProjectEnvTarget[]
): Promise<void> {
  output.debug(
    `Adding environment variable ${envName} to ${targets.length} targets`
  );

  const urlSecret = `/v2/now/secrets/${encodeURIComponent(envName)}`;
  const secrets = await Promise.all(
    targets.map(target =>
      client.fetch<Secret>(urlSecret, {
        method: 'POST',
        body: JSON.stringify({
          name: generateSecretName(envName, target),
          value: envValue,
          projectId: projectId,
          decryptable: target === ProjectEnvTarget.Development,
        }),
      })
    )
  );

  const body = targets.map((target, i) => ({
    key: envName,
    value: secrets[i].uid,
    target,
  }));

  const urlProject = `/v4/projects/${projectId}/env`;
  await client.fetch<ProjectEnvVariable>(urlProject, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const randomSecretSuffix = customAlphabet(
  '123456789abcdefghijklmnopqrstuvwxyz',
  4
);

function generateSecretName(envName: string, target: ProjectEnvTarget) {
  return `${
    slugify(envName).substring(0, 80) // we truncate because the max secret length is 100
  }-${target}-${randomSecretSuffix()}`
}
