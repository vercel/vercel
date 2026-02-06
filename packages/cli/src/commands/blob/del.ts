import * as blob from '@vercel/blob';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandName } from '../../util/pkg-name';
import { BlobDelTelemetryClient } from '../../util/telemetry/commands/blob/del';
import { delSubcommand } from './command';

export default async function del(
  client: Client,
  argv: string[],
  rwToken: string
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
    return 1;
  }

  if (!parsedArgs.args.length) {
    printError(
      `Missing required arguments: ${getCommandName('blob del urlOrPathname')}`
    );
    return 1;
  }

  const { args } = parsedArgs;

  telemetryClient.trackCliArgumentUrlsOrPathnames(args[0]);

  try {
    output.debug('Deleting blob');

    output.spinner('Deleting blob');

    await blob.del(args, { token: rwToken });
  } catch (err) {
    output.error(`Error deleting blob: ${err}`);
    return 1;
  }

  output.stopSpinner();

  output.success('Blob deleted');

  return 0;
}
