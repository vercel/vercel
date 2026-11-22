import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { FlagsTargetsTelemetryClient } from '../../util/telemetry/commands/flags/targets';
import targetsLs from './targets-ls';
import targetsAdd from './targets-add';
import targetsRemove from './targets-rm';
import {
  flagsCommand,
  targetsAddSubcommand,
  targetsListSubcommand,
  targetsRemoveSubcommand,
  targetsSubcommand,
} from './command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(targetsListSubcommand),
  add: getCommandAliases(targetsAddSubcommand),
  rm: getCommandAliases(targetsRemoveSubcommand),
};

export async function targets(client: Client): Promise<number> {
  const telemetry = new FlagsTargetsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(targetsSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(4), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 2;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('flags targets', subcommand);
    output.print(
      help(targetsSubcommand, {
        stream: client.stderr,
        parent: flagsCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: targetsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags targets', subcommandOriginal);
        printHelp(targetsListSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return targetsLs(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags targets', subcommandOriginal);
        printHelp(targetsAddSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return targetsAdd(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags targets', subcommandOriginal);
        printHelp(targetsRemoveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return targetsRemove(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(targetsSubcommand, {
          stream: client.stderr,
          parent: flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
