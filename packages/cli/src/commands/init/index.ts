import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import init from './init';
import { isError } from '@vercel/error-utils';
import { help } from '../help';
import { initCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { InitTelemetryClient } from '../../util/telemetry/commands/init';

const COMMAND_CONFIG = {
  init: ['init'],
};

export default async function main(client: Client) {
  let parsedArgs;

  const flagsSpecification = getFlagsSpecification(initCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new InitTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('init');
    output.print(help(initCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const args = getSubcommand(parsedArgs.args.slice(1), COMMAND_CONFIG).args;

  if (parsedArgs.args.length > 3) {
    output.error('Too many arguments.');
    return 1;
  }

  // Note: the "example" argument is tracked in the `init` function, so that we only
  // track the literal value for known examples (after the API call fetching the list).
  telemetry.trackCliArgumentDir(parsedArgs.args[2]);
  telemetry.trackCliFlagForce(parsedArgs.flags['--force']);

  try {
    return await init(client, parsedArgs.flags, args, telemetry);
  } catch (err: unknown) {
    output.prettyError(err);
    if (isError(err) && typeof err.stack === 'string') {
      output.debug(err.stack);
    }
    return 1;
  }
}
