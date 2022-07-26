import Client from './client';
import { Output } from './output/create-output';
import {
  ProjectEnvTarget,
  ProjectEnvType,
  ProjectEnvVariable,
  Secret,
} from '../types';
import getEnvRecords, { EnvRecordsSource } from './env/get-env-records';
import { isAPIError } from './errors-ts';

export default async function getDecryptedEnvRecords(
  output: Output,
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  target?: ProjectEnvTarget
): Promise<{ envs: ProjectEnvVariable[] }> {
  const { envs } = await getEnvRecords(output, client, projectId, source, {
    target: target || ProjectEnvTarget.Development,
    decrypt: true,
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
        } catch (err: unknown) {
          if (isAPIError(err) && err.status === 404) {
            return { id, type, key, value: '', found: false };
          }

          throw err;
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
