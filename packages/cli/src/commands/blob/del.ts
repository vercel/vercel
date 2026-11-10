import plural from 'pluralize';
import type Client from '../../util/client';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { delSubcommand } from './command';
import { BlobDelTelemetryClient } from '../../util/telemetry/commands/blob/del';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { blobOpts, type BlobRWToken } from '../../util/blob/token';
import { canPrompt } from '../../util/can-prompt';

export default async function del(
  client: Client,
  argv: string[],
  auth: BlobRWToken
): Promise<number> {
  const telemetryClient = new BlobDelTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(delSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  if (!parsedArgs.args.length) {
    printError(
      `Missing required arguments: ${getCommandName('blob delete urlOrPathname')}`
    );
    return 2;
  }

  const { args } = parsedArgs;
  const { '--if-match': ifMatch, '--yes': yes } = parsedArgs.flags;

  telemetryClient.trackCliArgumentUrlsOrPathnames(args[0]);
  telemetryClient.trackCliOptionIfMatch(ifMatch);
  telemetryClient.trackCliFlagYes(yes);

  // Deleting blobs loses their data, so ask first. Without a terminal it still
  // goes ahead for now, with a warning.
  if (!yes) {
    if (canPrompt(client)) {
      if (args.length > 1) {
        for (const target of args.slice(0, 5)) {
          output.print(`  ${target}\n`);
        }
        if (args.length > 5) {
          output.print(`  and ${args.length - 5} more\n`);
        }
      }
      const target =
        args.length === 1 ? args[0] : plural('blob', args.length, true);
      const confirmed = await client.input.confirm(
        `Delete ${target}? This cannot be undone.`,
        false
      );
      if (!confirmed) {
        output.log('Canceled. Nothing was changed.');
        return 130;
      }
    } else {
      output.warning(
        'Deleting blobs without a terminal will need --yes in a future major version. Add --yes to keep this working.'
      );
    }
  }

  try {
    output.debug('Deleting blob');

    output.spinner('Deleting blob');

    await blob.del(args, { ...blobOpts(auth), ifMatch });
  } catch (err) {
    output.error(`Error deleting blob: ${err}`);
    return 1;
  }

  output.stopSpinner();

  output.success('Blob deleted');

  return 0;
}
