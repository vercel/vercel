import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import add from './add';
import inspect from './inspect';
import ls from './ls';
import pause from './pause';
import resume from './resume';
import rm from './rm';
import test from './test';
import update from './update';
import {
  addSubcommand,
  drainsCommand,
  inspectSubcommand,
  listSubcommand,
  pauseSubcommand,
  removeSubcommand,
  resumeSubcommand,
  testSubcommand,
  updateSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import type Client from '../../util/client';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  ls: getCommandAliases(listSubcommand),
  add: getCommandAliases(addSubcommand),
  update: getCommandAliases(updateSubcommand),
  test: getCommandAliases(testSubcommand),
  rm: getCommandAliases(removeSubcommand),
  pause: getCommandAliases(pauseSubcommand),
  resume: getCommandAliases(resumeSubcommand),
};

export default async function drains(client: Client) {
  const { telemetryEventStore } = client;

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(drainsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new DrainsTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const { subcommand, subcommandOriginal, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('drains', subcommand);
    output.print(help(drainsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: drainsCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('drains', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('drains', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('drains', subcommandOriginal);
        printHelp(updateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    case 'test':
      if (needHelp) {
        telemetry.trackCliFlagHelp('drains', subcommandOriginal);
        printHelp(testSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandTest(subcommandOriginal);
      return test(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('drains', subcommandOriginal);
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    case 'pause':
      if (needHelp) {
        telemetry.trackCliFlagHelp('drains', subcommandOriginal);
        printHelp(pauseSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandPause(subcommandOriginal);
      return pause(client, args);
    case 'resume':
      if (needHelp) {
        telemetry.trackCliFlagHelp('drains', subcommandOriginal);
        printHelp(resumeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandResume(subcommandOriginal);
      return resume(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('drains', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
