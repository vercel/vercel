import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { AliasTelemetryClient } from '../../util/telemetry/commands/alias';
import { getCommandAliases } from '..';
import { type Command, help } from '../help';
import {
  aliasCommand,
  listSubcommand,
  removeSubcommand,
  setSubcommand,
} from './command';
import ls from './ls';
import rm from './rm';
import set from './set';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
  rm: getCommandAliases(removeSubcommand),
  set: getCommandAliases(setSubcommand),
};

export default async function alias(client: Client) {
  const telemetry = new AliasTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(aliasCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArguments.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('alias');
    output.print(help(aliasCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: aliasCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('alias', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('alias', subcommandOriginal);
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    case 'set':
      if (needHelp) {
        telemetry.trackCliFlagHelp('alias', subcommandOriginal);
        printHelp(setSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSet(subcommandOriginal);
      return set(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('alias', subcommandOriginal);
        printHelp(setSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSet(subcommandOriginal);
      return set(client, args);
  }
}
