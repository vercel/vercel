import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandAliases } from '..';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import output from '../../output-manager';
import { ActivityTelemetryClient } from '../../util/telemetry/commands/activity';
import { activityCommand, listSubcommand, typesSubcommand } from './command';
import list from './list';
import types from './types';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
  types: getCommandAliases(typesSubcommand),
};

export default async function activity(client: Client): Promise<number> {
  const telemetry = new ActivityTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(activityCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  function printSubcommandHelp(command: Command) {
    output.print(
      help(command, { parent: activityCommand, columns: client.stderr.columns })
    );
  }

  if (!subcommand) {
    if (needHelp || !parsedArgs.args[1]) {
      if (needHelp) {
        telemetry.trackCliFlagHelp('activity');
      }
      output.print(help(activityCommand, { columns: client.stderr.columns }));
      return 2;
    }

    output.error(getInvalidSubcommand(COMMAND_CONFIG));
    output.print(help(activityCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'ls': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('activity', subcommandOriginal);
        printSubcommandHelp(listSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandLs(subcommandOriginal);
      return list(client, args);
    }
    case 'types': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('activity', subcommandOriginal);
        printSubcommandHelp(typesSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandTypes(subcommandOriginal);
      return types(client, args);
    }
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(activityCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
