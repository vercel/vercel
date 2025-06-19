import type { Dictionary } from '@vercel/client';
import { resolve } from 'node:path';
import { createEnvObject } from '../env/diff-env-files';

import type Client from '../client';
import { getFlagsSpecification } from '../get-flags-specification';
import { blobCommand } from '../../commands/blob/command';
import { parseArguments } from '../get-args';
import { getCommandName, packageName } from '../pkg-name';
import cmd from '../output/cmd';
import listItem from '../output/list-item';

const ErrorMessage = `No Vercel Blob token found. To fix this issue, choose one of the following options:
${listItem('Link your current folder to a Vercel Project that has a Vercel Blob store connected', 1)}
${listItem(`Pass the token directly as an option: ${getCommandName('blob list --rw-token BLOB_TOKEN')}`, 2)}
${listItem(`Set the Token as an environment variable: ${cmd(`VERCEL_BLOB_READ_WRITE_TOKEN=BLOB_TOKEN ${packageName} blob list`)}`, 3)}`;

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
      error: ErrorMessage,
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
      error: ErrorMessage,
      success: false,
    };
  }

  if (!env) {
    return {
      error: ErrorMessage,
      success: false,
    };
  }

  if (!env.BLOB_READ_WRITE_TOKEN) {
    return {
      error: ErrorMessage,
      success: false,
    };
  }

  return { token: env.BLOB_READ_WRITE_TOKEN, success: true };
}
