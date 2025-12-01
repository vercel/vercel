import type Client from '../../util/client';
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
import { BlobListTelemetryClient } from '../../util/telemetry/commands/blob/list';
import { printError } from '../../util/error';
import { validateLsArgs } from '../../util/validate-ls-args';

function isMode(mode: string): mode is 'folded' | 'expanded' {
  return mode === 'folded' || mode === 'expanded';
}

export default async function list(
  client: Client,
  argv: string[],
  rwToken: string
): Promise<number> {
  const telemetryClient = new BlobListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;

  const validationResult = validateLsArgs({
    commandName: 'blob list',
    args: args,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  const {
    '--limit': limit,
    '--cursor': cursor,
    '--prefix': prefix,
    '--mode': modeFlag,
  } = flags;

  telemetryClient.trackCliOptionLimit(limit);
  telemetryClient.trackCliOptionCursor(cursor);
  telemetryClient.trackCliOptionPrefix(prefix);
  telemetryClient.trackCliOptionMode(modeFlag);

  const mode = modeFlag ?? 'expanded';
  if (!isMode(mode)) {
    output.error(
      `Invalid mode: ${mode} has to be either 'folded' or 'expanded'`
    );

    return 1;
  }

  let list: blob.ListBlobResult;
  try {
    output.debug('Fetching blobs');

    output.spinner('Fetching blobs');
    list = await blob.list({
      token: rwToken,
      limit: limit ?? 10,
      cursor,
      mode,
      prefix,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

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
    output.print(`\n${tablePrint}\n\n`);
  } else {
    output.log('No blobs in this store');
  }

  if (list.cursor) {
    const nextFlags = getCommandFlags(flags, ['_', '--cursor']);
    output.log(
      `To display the next page run ${getCommandName(
        `blob list${nextFlags} --cursor ${list.cursor}`
      )}`
    );
  }

  return 0;
}
