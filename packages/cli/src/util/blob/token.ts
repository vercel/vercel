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
${listItem(`Pass the token directly as an option: ${getCommandName('blob list --rw-token BLOB_READ_WRITE_TOKEN')}`, 1)}
${listItem(`Set the Token as an environment variable: ${cmd(`BLOB_READ_WRITE_TOKEN=BLOB_READ_WRITE_TOKEN ${packageName} blob list`)}`, 2)}
${listItem('Link your current folder to a Vercel Project that has a Vercel Blob store connected', 3)}`;

export type BlobRWToken =
  | { token: string; success: true }
  | { error: string; success: false };

export async function getBlobRWToken(
  client: Client,
  argv: string[]
): Promise<BlobRWToken> {
  const flagsSpecification = getFlagsSpecification(blobCommand.options);

  try {
    const parsedArgs = parseArguments(argv, flagsSpecification);
    const {
      flags: { '--rw-token': rwToken },
    } = parsedArgs;

    if (rwToken) {
      return { token: rwToken, success: true };
    }
  } catch (err) {
    // continue with token hierarchy
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN, success: true };
  }

  const filename = '.env.local';
  const fullPath = resolve(client.cwd, filename);

  try {
    const env = await createEnvObject(fullPath);

    if (env?.BLOB_READ_WRITE_TOKEN) {
      return { token: env.BLOB_READ_WRITE_TOKEN, success: true };
    }
  } catch (error) {
    // continue with token hierarchy
  }

  return {
    error: ErrorMessage,
    success: false,
  };
}
