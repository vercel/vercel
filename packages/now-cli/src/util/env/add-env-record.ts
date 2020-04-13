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
  envValue: string | undefined,
  targets: ProjectEnvTarget[]
): Promise<void> {
  output.debug(
    `Adding Environment Variable ${envName} to ${targets.length} targets`
  );

  let values: string[] | undefined;

  if (envValue) {
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
    values = secrets.map(secret => secret.uid);
  }

  const body = targets.map((target, i) => ({
    key: envName,
    value: values ? values[i] : '',
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
  }-${target}-${randomSecretSuffix()}`;
}
