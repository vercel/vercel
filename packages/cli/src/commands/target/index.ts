import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { type Command, help } from '../help';
import list from './list';
import { listSubcommand, targetCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { TargetTelemetryClient } from '../../util/telemetry/commands/target';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(targetCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { telemetryEventStore } = client;
  const telemetry = new TargetTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  parsedArgs.args = parsedArgs.args.slice(1);
  const subcommand = parsedArgs.args[0];
  const args = parsedArgs.args.slice(1);

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('target');
    output.print(help(targetCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: targetCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'ls':
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('target', 'list');
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommand);
      return await list(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(targetCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
