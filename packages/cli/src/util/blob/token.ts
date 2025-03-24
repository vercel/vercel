import type { Dictionary } from '@vercel/client';
import output from '../../output-manager';
import { resolve } from 'node:path';
import { createEnvObject } from '../env/diff-env-files';
import { printError } from '../error';
import type Client from '../client';

export async function getBlobRWToken(
  client: Client
): Promise<string | undefined> {
  const filename = '.env.local';
  const fullPath = resolve(client.cwd, filename);

  let env: Dictionary<string | undefined> | undefined;
  try {
    env = await createEnvObject(fullPath);
  } catch (error) {
    printError(error);
    return;
  }

  if (!env) {
    output.error(`No environment variables found in ${filename}`);
    return;
  }

  if (!env.BLOB_READ_WRITE_TOKEN) {
    output.error(`No BLOB_READ_WRITE_TOKEN found in ${filename}`);
    return;
  }

  return env.BLOB_READ_WRITE_TOKEN;
}
