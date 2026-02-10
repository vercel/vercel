import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { FlagsTelemetryClient } from '../../util/telemetry/commands/flags';
import ls from './ls';
import inspect from './inspect';
import add from './add';
import rm from './rm';
import archive from './archive';
import disable from './disable';
import enable from './enable';
import { sdkKeys } from './sdk-keys';
import {
  flagsCommand,
  listSubcommand,
  inspectSubcommand,
  addSubcommand,
  removeSubcommand,
  archiveSubcommand,
  disableSubcommand,
  enableSubcommand,
  sdkKeysSubcommand,
} from './command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  add: getCommandAliases(addSubcommand),
  rm: getCommandAliases(removeSubcommand),
  archive: getCommandAliases(archiveSubcommand),
  disable: getCommandAliases(disableSubcommand),
  enable: getCommandAliases(enableSubcommand),
  'sdk-keys': getCommandAliases(sdkKeysSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new FlagsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(flagsCommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
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
    telemetry.trackCliFlagHelp('flags', subcommand);
    output.print(help(flagsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: flagsCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    case 'archive':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(archiveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandArchive(subcommandOriginal);
      return archive(client, args);
    case 'disable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(disableSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandDisable(subcommandOriginal);
      return disable(client, args);
    case 'enable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(enableSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandEnable(subcommandOriginal);
      return enable(client, args);
    case 'sdk-keys':
      telemetry.trackCliSubcommandSdkKeys(subcommandOriginal);
      return sdkKeys(client);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
