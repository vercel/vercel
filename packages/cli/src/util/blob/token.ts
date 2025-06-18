import type { Dictionary } from '@vercel/client';
import { resolve } from 'node:path';
import { createEnvObject } from '../env/diff-env-files';

import type Client from '../client';
import { getFlagsSpecification } from '../get-flags-specification';
import { blobCommand } from '../../commands/blob/command';
import { parseArguments } from '../get-args';

export async function getBlobRWToken(
  client: Client,
  argv: string[]
): Promise<
  { token: string; success: true } | { error: string; success: false }
> {
  const flagsSpecification = getFlagsSpecification(blobCommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    return {
      error: "Couldn't parse arguments",
      success: false,
    };
  }

  const {
    flags: { '--rw-token': rwToken },
  } = parsedArgs;

  if (rwToken) {
    return { token: rwToken, success: true };
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN, success: true };
  }

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
