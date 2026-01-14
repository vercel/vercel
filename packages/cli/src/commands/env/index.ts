import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import add from './add';
import ls from './ls';
import pull from './pull';
import rm from './rm';
import run, { needsHelpForRun } from './run';
import update from './update';
import {
  envCommand,
  addSubcommand,
  listSubcommand,
  pullSubcommand,
  removeSubcommand,
  runSubcommand,
  updateSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { EnvTelemetryClient } from '../../util/telemetry/commands/env';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
  add: getCommandAliases(addSubcommand),
  rm: getCommandAliases(removeSubcommand),
  pull: getCommandAliases(pullSubcommand),
  run: getCommandAliases(runSubcommand),
  update: getCommandAliases(updateSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new EnvTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(envCommand.options);
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
    telemetry.trackCliFlagHelp('env', subcommand);
    output.print(help(envCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: envCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', subcommandOriginal);
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    case 'pull':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', subcommandOriginal);
        printHelp(pullSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandPull(subcommandOriginal);
      return pull(client, args);
    case 'run':
      /**
       * The run subcommand uses a helper to check for --help because of the
       * special `--` argument separator. The user's command (after `--`) might
       * include --help intended for their program, not for vercel. For example:
       *   `vercel env run --help` → shows vercel's help
       *   `vercel env run -- node --help` → runs node's help
       */
      if (needsHelpForRun(client)) {
        telemetry.trackCliFlagHelp('env', subcommandOriginal);
        printHelp(runSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRun(subcommandOriginal);
      return run(client);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', subcommandOriginal);
        printHelp(updateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(envCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
