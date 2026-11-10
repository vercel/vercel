import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { FlagsConnectionsTelemetryClient } from '../../util/telemetry/commands/flags/connections';
import connectionsLs from './connections-ls';
import connectionsAdd from './connections-add';
import connectionsRm from './connections-rm';
import {
  flagsCommand,
  connectionsSubcommand,
  connectionsListSubcommand,
  connectionsAddSubcommand,
  connectionsRemoveSubcommand,
} from './command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(connectionsListSubcommand),
  add: getCommandAliases(connectionsAddSubcommand),
  rm: getCommandAliases(connectionsRemoveSubcommand),
};

export async function connections(client: Client): Promise<number> {
  const telemetry = new FlagsConnectionsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    connectionsSubcommand.options
  );
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    // Skip 'node', 'cli.js', 'flags', 'connections' to get the subcommand args
    parsedArgs = parseArguments(client.argv.slice(4), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(0);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('flags connections', subcommand);
    output.print(
      help(connectionsSubcommand, {
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
        parent: connectionsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags connections', subcommandOriginal);
        printHelp(connectionsListSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return connectionsLs(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags connections', subcommandOriginal);
        printHelp(connectionsAddSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return connectionsAdd(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags connections', subcommandOriginal);
        printHelp(connectionsRemoveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return connectionsRm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(connectionsSubcommand, {
          stream: client.stderr,
          parent: flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
