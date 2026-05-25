import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import { ActivityTelemetryClient } from '../../util/telemetry/commands/activity';
import { activityCommand, typesSubcommand } from './command';

const COMMAND_CONFIG = {
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

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('activity', subcommand);
    output.print(help(activityCommand, { columns: client.stderr.columns }));
    return 0;
  }

  function printSubcommandHelp(command: Command) {
    output.print(
      help(command, { parent: activityCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'types': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('activity', subcommandOriginal);
        printSubcommandHelp(typesSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandTypes(subcommandOriginal);
      const typesFn = (await import('./types')).default;
      return typesFn(client, telemetry);
    }
    default: {
      if (needHelp) {
        telemetry.trackCliFlagHelp('activity', subcommandOriginal);
        output.print(help(activityCommand, { columns: client.stderr.columns }));
        return 0;
      }
      telemetry.trackCliSubcommandLs(subcommandOriginal);
      const listFn = (await import('./list')).default;
      return listFn(client, telemetry);
    }
  }
}
