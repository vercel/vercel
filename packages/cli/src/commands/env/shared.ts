import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import ls from './shared-ls';
import inspect from './shared-inspect';
import add from './shared-add';
import update from './shared-update';
import remove from './shared-remove';
import {
  envCommand,
  sharedSubcommand,
  sharedListSubcommand,
  sharedInspectSubcommand,
  sharedAddSubcommand,
  sharedUpdateSubcommand,
  sharedRemoveSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { EnvSharedTelemetryClient } from '../../util/telemetry/commands/env/shared';

const COMMAND_CONFIG = {
  ls: getCommandAliases(sharedListSubcommand),
  inspect: getCommandAliases(sharedInspectSubcommand),
  add: getCommandAliases(sharedAddSubcommand),
  update: getCommandAliases(sharedUpdateSubcommand),
  rm: getCommandAliases(sharedRemoveSubcommand),
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
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env shared', subcommandOriginal);
        printHelp(sharedInspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env shared', subcommandOriginal);
        printHelp(sharedAddSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env shared', subcommandOriginal);
        printHelp(sharedUpdateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env shared', subcommandOriginal);
        printHelp(sharedRemoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client, args);
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
