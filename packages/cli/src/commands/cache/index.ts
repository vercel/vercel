import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import purge from './purge';
import { cacheCommand, purgeSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { CacheTelemetryClient } from '../../util/telemetry/commands/cache';

const COMMAND_CONFIG = {
  purge: getCommandAliases(purgeSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new CacheTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(cacheCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp(cacheCommand.name);
    output.print(help(cacheCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    telemetry.trackCliFlagHelp(command.name, subcommandOriginal);
    output.print(
      help(command, { parent: cacheCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'purge':
      if (needHelp) {
        printHelp(purgeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandPurge(subcommandOriginal);
      return purge(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(cacheCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
