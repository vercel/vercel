import Client from './client';
import { Output } from './output/create-output';
import {
  ProjectEnvTarget,
  ProjectEnvType,
  ProjectEnvVariable,
  Secret,
} from '../types';
import getEnvRecords from './env/get-env-records';

export default async function getDecryptedEnvRecords(
  output: Output,
  client: Client,
  projectId: string
): Promise<{ envs: ProjectEnvVariable[] }> {
  const { envs } = await getEnvRecords(output, client, projectId, {
    target: ProjectEnvTarget.Development,
  });

  const envsWithDecryptedSecrets = await Promise.all(
    envs.map(async ({ id, type, key, value }) => {
      // it's not possible to create secret env variables for development
      // anymore but we keep this because legacy env variables with "decryptable"
      // secret values still exit in our system
      if (type === ProjectEnvType.Secret) {
        try {
          const secretIdOrName = value;

          if (!secretIdOrName) {
            return { id, type, key, value: '', found: true };
          }

          output.debug(`Fetching decrypted secret ${secretIdOrName}`);
          const secret = await client.fetch<Secret>(
            `/v2/now/secrets/${secretIdOrName}?decrypt=true`
          );

          return { id, type, key, value: secret.value, found: true };
        } catch (error) {
          if (error && error.status === 404) {
            return { id, type, key, value: '', found: false };
          }

          throw error;
        }
      }

      return { id, type, key, value, found: true };
    })
  );

  for (let env of envsWithDecryptedSecrets) {
    if (!env.found) {
      output.print('');
      output.warn(
        `Unable to download variable ${env.key} because associated secret was deleted`
      );
    }
  }

  return { envs: envsWithDecryptedSecrets };
}
