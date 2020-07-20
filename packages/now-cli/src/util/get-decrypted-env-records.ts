import getEnvVariables from './env/get-env-records';
import getDecryptedSecret from './env/get-decrypted-secret';
import Client from './client';
import { Output } from './output/create-output';
import { ProjectEnvTarget, Project } from '../types';

import { Env } from '@vercel/build-utils';

export default async function getDecryptedEnvRecords(
  output: Output,
  client: Client,
  project: null | Project,
  target: ProjectEnvTarget
): Promise<Env> {
  if (!project) {
    return {};
  }

  const envs = await getEnvVariables(output, client, project.id, 4, target);
  const decryptedValues = await Promise.all(
    envs.map(async env => {
      try {
        const value = await getDecryptedSecret(output, client, env.value);
        return { value, found: true };
      } catch (error) {
        if (error && error.status === 404) {
          return { value: '', found: false };
        }
        throw error;
      }
    })
  );

  const results: Env = {};
  for (let i = 0; i < decryptedValues.length; i++) {
    const { key } = envs[i];
    const { value, found } = decryptedValues[i];

    if (!found) {
      output.print('');
      output.warn(
        `Unable to download variable ${key} because associated secret was deleted`
      );
      continue;
    }

    results[key] = value ? value : '';
  }
  return results;
}
