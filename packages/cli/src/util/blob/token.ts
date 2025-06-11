import type { Dictionary } from '@vercel/client';
import { resolve } from 'node:path';
import { createEnvObject } from '../env/diff-env-files';

import type Client from '../client';

export async function getBlobRWToken(
  client: Client
): Promise<
  { token: string; success: true } | { error: string; success: false }
> {
  const filename = '.env.local';
  const fullPath = resolve(client.cwd, filename);

  let env: Dictionary<string | undefined> | undefined;
  try {
    env = await createEnvObject(fullPath);
  } catch (error) {
    return {
      error: "Couldn't read .env.local file. Please check if it exists.",
      success: false,
    };
  }

  if (!env) {
    return {
      error: `No environment variables found in ${filename}`,
      success: false,
    };
  }

  if (!env.BLOB_READ_WRITE_TOKEN) {
    return {
      error: `No BLOB_READ_WRITE_TOKEN found in ${filename}`,
      success: false,
    };
  }

  return { token: env.BLOB_READ_WRITE_TOKEN, success: true };
}
