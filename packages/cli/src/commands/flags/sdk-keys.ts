import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { FlagsSdkKeysTelemetryClient } from '../../util/telemetry/commands/flags/sdk-keys';
import sdkKeysLs from './sdk-keys-ls';
import sdkKeysAdd from './sdk-keys-add';
import sdkKeysRm from './sdk-keys-rm';
import {
  flagsCommand,
  sdkKeysSubcommand,
  sdkKeysListSubcommand,
  sdkKeysAddSubcommand,
  sdkKeysRemoveSubcommand,
} from './command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(sdkKeysListSubcommand),
  add: getCommandAliases(sdkKeysAddSubcommand),
  rm: getCommandAliases(sdkKeysRemoveSubcommand),
};

export async function sdkKeys(client: Client): Promise<number> {
  const telemetry = new FlagsSdkKeysTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(sdkKeysSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    // Skip 'node', 'cli.js', 'flags', 'sdk-keys' to get the subcommand args
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
    telemetry.trackCliFlagHelp('flags sdk-keys', subcommand);
    output.print(
      help(sdkKeysSubcommand, {
        parent: flagsCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: sdkKeysSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags sdk-keys', subcommandOriginal);
        printHelp(sdkKeysListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return sdkKeysLs(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags sdk-keys', subcommandOriginal);
        printHelp(sdkKeysAddSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return sdkKeysAdd(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags sdk-keys', subcommandOriginal);
        printHelp(sdkKeysRemoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return sdkKeysRm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(sdkKeysSubcommand, {
          parent: flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
