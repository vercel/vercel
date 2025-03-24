import type Client from '../../util/client';
import { createEnvObject } from '../../util/env/diff-env-files';
import { resolve } from 'path';
import { printError } from '../../util/error';
import type { Dictionary } from '@vercel/client';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import table from '../../util/output/table';
import chalk from 'chalk';
import ms from 'ms';
import getCommandFlags from '../../util/get-command-flags';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { listSubcommand } from './command';
import { getCommandName } from '../../util/pkg-name';

function isMode(mode: string): mode is 'folded' | 'expanded' {
  return mode === 'folded' || mode === 'expanded';
}

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const { print, debug, spinner } = output;

  const flagsSpecification = getFlagsSpecification(listSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags: opts } = parsedArgs;

  const filename = '.env.local';
  const fullPath = resolve(client.cwd, filename);

  let env: Dictionary<string | undefined> | undefined;
  try {
    env = await createEnvObject(fullPath);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (!env) {
    output.error(`No environment variables found in ${filename}`);
    return 1;
  }

  if (!env.BLOB_READ_WRITE_TOKEN) {
    output.error(`No BLOB_READ_WRITE_TOKEN found in ${filename}`);
    return 1;
  }

  spinner('Fetching blobs');

  const mode = opts['--mode'] ?? 'expanded';
  if (!isMode(mode)) {
    output.error(`Invalid mode: ${mode}`);
    return 1;
  }

  let list: blob.ListBlobResult;
  try {
    debug('Fetching blobs');

    list = await blob.list({
      token: env.BLOB_READ_WRITE_TOKEN,
      limit: opts['--limit'] ?? 10,
      cursor: opts['--cursor'],
      mode: mode,
      prefix: opts['--prefix'],
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const headers = ['Uploaded At', 'Size', 'Pathname', 'URL'];
  const urls: string[] = [];

  const tablePrint = table(
    [
      headers.map(header => chalk.dim(header)),
      ...list.blobs.map(blob => {
        urls.push(blob.url);
        const uploadedAt = ms(Date.now() - new Date(blob.uploadedAt).getTime());

        return [uploadedAt, String(blob.size), blob.pathname, blob.url];
      }),
    ],
    { hsep: 5 }
  ).replace(/^/gm, '  ');

  if (list.blobs.length > 0) {
    print(`\n${tablePrint}\n\n`);
  }

  if (!client.stdout.isTTY) {
    client.stdout.write(urls.join('\n'));
    client.stdout.write('\n');
  }

  if (list.cursor) {
    const flags = getCommandFlags(opts, ['_', '--cursor']);
    output.log(
      `To display the next page run ${getCommandName(
        `blob list${flags} --cursor ${list.cursor}`
      )}`
    );
  }

  return 0;
}
