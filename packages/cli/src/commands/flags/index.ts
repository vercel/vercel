import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { commandsStructs, getCommandAliases } from '..';
import { findCommandShorthands } from '../../util/command-shorthands';
import { FlagsTelemetryClient } from '../../util/telemetry/commands/flags';
import ls from './ls';
import stale from './stale';
import inspect from './inspect';
import versions from './versions';
import evaluations from './evaluations';
import create from './add';
import openFlag from './open';
import update from './update';
import set from './set';
import useTargeting from './use-targeting';
import split from './split';
import rollout from './rollout';
import rm from './rm';
import archive from './archive';
import unarchive from './unarchive';
import disable from './disable';
import enable from './enable';
import { sdkKeys } from './sdk-keys';
import { connections } from './connections';
import { segments } from './segments';
import { entities } from './entities';
import labels from './labels';
import { rules } from './rules';
import { targets } from './targets';
import { targeting } from './targeting';
import {
  flagsCommand,
  listSubcommand,
  staleSubcommand,
  inspectSubcommand,
  versionsSubcommand,
  evaluationsSubcommand,
  createSubcommand,
  openSubcommand,
  updateSubcommand,
  setSubcommand,
  targetingSubcommand,
  useTargetingSubcommand,
  splitSubcommand,
  rolloutSubcommand,
  removeSubcommand,
  archiveSubcommand,
  unarchiveSubcommand,
  disableSubcommand,
  prepareSubcommand,
  datafileSubcommand,
  enableSubcommand,
  segmentsSubcommand,
  entitiesSubcommand,
  labelsSubcommand,
  rulesSubcommand,
  targetsSubcommand,
  sdkKeysSubcommand,
  connectionsSubcommand,
  overrideSubcommand,
} from './command';
import emitDatafiles from './emit-datafiles';
import override from './override';
import datafile from './datafile';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
  stale: getCommandAliases(staleSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  versions: getCommandAliases(versionsSubcommand),
  evaluations: getCommandAliases(evaluationsSubcommand),
  create: getCommandAliases(createSubcommand),
  open: getCommandAliases(openSubcommand),
  update: getCommandAliases(updateSubcommand),
  set: getCommandAliases(setSubcommand),
  targeting: getCommandAliases(targetingSubcommand),
  'use-targeting': getCommandAliases(useTargetingSubcommand),
  split: getCommandAliases(splitSubcommand),
  rollout: getCommandAliases(rolloutSubcommand),
  delete: getCommandAliases(removeSubcommand),
  archive: getCommandAliases(archiveSubcommand),
  unarchive: getCommandAliases(unarchiveSubcommand),
  disable: getCommandAliases(disableSubcommand),
  enable: getCommandAliases(enableSubcommand),
  rules: getCommandAliases(rulesSubcommand),
  targets: getCommandAliases(targetsSubcommand),
  segments: getCommandAliases(segmentsSubcommand),
  entities: getCommandAliases(entitiesSubcommand),
  labels: getCommandAliases(labelsSubcommand),
  'sdk-keys': getCommandAliases(sdkKeysSubcommand),
  connections: getCommandAliases(connectionsSubcommand),
  prepare: getCommandAliases(prepareSubcommand),
  datafile: getCommandAliases(datafileSubcommand),
  override: getCommandAliases(overrideSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new FlagsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(flagsCommand.options);
  const argv = client.argv.slice(2);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    // Leaves a subcommand's own `-d` (`--description`) to the subcommand.
    parsedArgs = parseArguments(argv, flagsSpecification, {
      permissive: true,
      commandShorthands: findCommandShorthands(commandsStructs, argv),
    });
  } catch (err) {
    printError(err);
    return 2;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('flags', subcommand);
    output.print(
      help(flagsCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: flagsCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'versions':
      telemetry.trackCliSubcommandVersions(subcommandOriginal);
      return versions(client, needHelp ? [...args, '--help'] : args);
    case 'evaluations':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(evaluationsSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandEvaluations(subcommandOriginal);
      return evaluations(client, args);
    case 'stale':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(staleSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandStale(subcommandOriginal);
      return stale(client, args);
    case 'open':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(openSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return openFlag(client, args);
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(createSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      if (subcommandOriginal === 'add') {
        warnDeprecatedSubcommand(client, 'flags add', 'flags create');
      }
      return create(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(updateSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    case 'set':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(setSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandSet(subcommandOriginal);
      return set(client, args);
    case 'use-targeting':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(useTargetingSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUseTargeting(subcommandOriginal);
      warnDeprecatedSubcommand(
        client,
        'flags use-targeting',
        'flags targeting enable'
      );
      return useTargeting(client, args);
    case 'targeting':
      telemetry.trackCliSubcommandTargeting(subcommandOriginal);
      return targeting(client, args);
    case 'split':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(splitSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandSplit(subcommandOriginal);
      return split(client, args);
    case 'rollout':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(rolloutSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRollout(subcommandOriginal);
      return rollout(client, args);
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(removeSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(client, 'flags remove', 'flags delete');
      }
      return rm(client, args);
    case 'archive':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(archiveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandArchive(subcommandOriginal);
      return archive(client, args);
    case 'unarchive':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(unarchiveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUnarchive(subcommandOriginal);
      return unarchive(client, args);
    case 'disable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(disableSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDisable(subcommandOriginal);
      return disable(client, args);
    case 'enable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(enableSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandEnable(subcommandOriginal);
      return enable(client, args);
    case 'rules':
      telemetry.trackCliSubcommandRules(subcommandOriginal);
      return rules(client);
    case 'targets':
      telemetry.trackCliSubcommandTargets(subcommandOriginal);
      return targets(client);
    case 'sdk-keys':
      telemetry.trackCliSubcommandSdkKeys(subcommandOriginal);
      return sdkKeys(client);
    case 'connections':
      telemetry.trackCliSubcommandConnections(subcommandOriginal);
      return connections(client);
    case 'segments':
      telemetry.trackCliSubcommandSegments(subcommandOriginal);
      return segments(client);
    case 'entities':
      telemetry.trackCliSubcommandEntities(subcommandOriginal);
      return entities(client);
    case 'labels':
      telemetry.trackCliSubcommandLabels(subcommandOriginal);
      return labels(client);
    case 'prepare':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(prepareSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandPrepare(subcommandOriginal);
      return emitDatafiles(client);
    case 'datafile':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(datafileSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDatafile(subcommandOriginal);
      return datafile(client, args);
    case 'override':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(overrideSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandOverride(subcommandOriginal);
      return override(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
