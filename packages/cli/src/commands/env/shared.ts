import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import ls from './shared-ls';
import { envCommand, sharedSubcommand, sharedListSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { EnvSharedTelemetryClient } from '../../util/telemetry/commands/env/shared';

const COMMAND_CONFIG = {
  ls: getCommandAliases(sharedListSubcommand),
};

export default async function shared(client: Client): Promise<number> {
  const telemetry = new EnvSharedTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(sharedSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(2);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('env shared', subcommand);
    output.print(
      help(sharedSubcommand, {
        parent: envCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: sharedSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env shared', subcommandOriginal);
        printHelp(sharedListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(sharedSubcommand, {
          parent: envCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
