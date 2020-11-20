import getDecryptedSecret from './env/get-decrypted-secret';
import Client from './client';
import { Output } from './output/create-output';
import { ProjectEnvType, ProjectEnvVariable } from '../types';

import { Env } from '@vercel/build-utils';

export default async function getDecryptedEnvRecords(
  output: Output,
  client: Client,
  projectEnvs: ProjectEnvVariable[]
): Promise<Env> {
  const decryptedValues = await Promise.all(
    projectEnvs.map(async env => {
      if (env.type === ProjectEnvType.System) {
        return { value: '', found: true };
      } else if (env.type === ProjectEnvType.Plaintext) {
        return { value: env.value, found: true };
      }

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
    const { key } = projectEnvs[i];
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
