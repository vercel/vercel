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
import create from './add';
import openFlag from './open';
import update from './update';
import set from './set';
import rollout from './rollout';
import rm from './rm';
import archive from './archive';
import disable from './disable';
import enable from './enable';
import { sdkKeys } from './sdk-keys';
import {
  flagsCommand,
  listSubcommand,
  inspectSubcommand,
  createSubcommand,
  openSubcommand,
  updateSubcommand,
  setSubcommand,
  rolloutSubcommand,
  removeSubcommand,
  archiveSubcommand,
  disableSubcommand,
  prepareSubcommand,
  enableSubcommand,
  sdkKeysSubcommand,
  overrideSubcommand,
} from './command';
import emitDatafiles from './emit-datafiles';
import override from './override';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  create: getCommandAliases(createSubcommand),
  open: getCommandAliases(openSubcommand),
  update: getCommandAliases(updateSubcommand),
  set: getCommandAliases(setSubcommand),
  rollout: getCommandAliases(rolloutSubcommand),
  rm: getCommandAliases(removeSubcommand),
  archive: getCommandAliases(archiveSubcommand),
  disable: getCommandAliases(disableSubcommand),
  enable: getCommandAliases(enableSubcommand),
  'sdk-keys': getCommandAliases(sdkKeysSubcommand),
  prepare: getCommandAliases(prepareSubcommand),
  override: getCommandAliases(overrideSubcommand),
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
    case 'open':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(openSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return openFlag(client, args);
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(createSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(updateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    case 'set':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(setSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSet(subcommandOriginal);
      return set(client, args);
    case 'rollout':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(rolloutSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRollout(subcommandOriginal);
      return rollout(client, args);
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
    case 'prepare':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(prepareSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandPrepare(subcommandOriginal);
      return emitDatafiles(client);
    case 'override':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(overrideSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandOverride(subcommandOriginal);
      return override(client, args);
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
