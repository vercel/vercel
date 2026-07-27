import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { printError } from '../../util/error';
import { help, type Command } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { VcrTelemetryClient } from '../../util/telemetry/commands/vcr';
import {
  vcrCommand,
  listSubcommand,
  inspectSubcommand,
  addSubcommand,
  removeSubcommand,
  loginSubcommand,
} from './command';
import {
  imageAggregateCommand,
  imageLsSubcommand,
  imageInspectSubcommand,
  imageRmSubcommand,
} from './image/command';
import {
  tagsAggregateCommand,
  tagsLsSubcommand,
  tagsInspectSubcommand,
} from './tags/command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  add: getCommandAliases(addSubcommand),
  rm: getCommandAliases(removeSubcommand),
  login: getCommandAliases(loginSubcommand),
  tag: getCommandAliases(tagsAggregateCommand),
  image: getCommandAliases(imageAggregateCommand),
};

export default async function vcr(client: Client): Promise<number> {
  const telemetry = new VcrTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(vcrCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  function printHelp(command: Command): void {
    output.print(
      help(command, { parent: vcrCommand, columns: client.stderr.columns })
    );
  }

  if (needHelp) {
    switch (subcommand) {
      case 'ls':
        telemetry.trackCliFlagHelp('vcr', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      case 'inspect':
        telemetry.trackCliFlagHelp('vcr', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 2;
      case 'add':
        telemetry.trackCliFlagHelp('vcr', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      case 'rm':
        telemetry.trackCliFlagHelp('vcr', subcommandOriginal);
        printHelp(removeSubcommand);
        return 2;
      case 'login':
        telemetry.trackCliFlagHelp('vcr', subcommandOriginal);
        printHelp(loginSubcommand);
        return 2;
      case 'tag': {
        telemetry.trackCliFlagHelp('vcr', subcommandOriginal);
        const nested = args[0];
        if (nested === 'ls' || nested === 'list') {
          printHelp(tagsLsSubcommand);
          return 2;
        }
        if (nested === 'inspect' || nested === 'get') {
          printHelp(tagsInspectSubcommand);
          return 2;
        }
        printHelp(tagsAggregateCommand);
        return 2;
      }
      case 'image': {
        telemetry.trackCliFlagHelp('vcr', subcommandOriginal);
        const nested = args[0];
        if (nested === 'ls' || nested === 'list') {
          printHelp(imageLsSubcommand);
          return 2;
        }
        if (nested === 'inspect' || nested === 'get') {
          printHelp(imageInspectSubcommand);
          return 2;
        }
        if (nested === 'rm' || nested === 'remove' || nested === 'delete') {
          printHelp(imageRmSubcommand);
          return 2;
        }
        printHelp(imageAggregateCommand);
        return 2;
      }
      default:
        telemetry.trackCliFlagHelp('vcr', subcommandOriginal);
        output.print(help(vcrCommand, { columns: client.stderr.columns }));
        return 2;
    }
  }

  switch (subcommand) {
    case 'ls':
      telemetry.trackCliSubcommandLs(subcommandOriginal);
      return (await import('./ls')).default(client, args, telemetry);
    case 'inspect':
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return (await import('./inspect')).default(client, args, telemetry);
    case 'add':
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return (await import('./add')).default(client, args, telemetry);
    case 'rm':
      telemetry.trackCliSubcommandRm(subcommandOriginal);
      return (await import('./rm')).default(client, args, telemetry);
    case 'login':
      telemetry.trackCliSubcommandLogin(subcommandOriginal);
      return (await import('./login')).default(client, args, telemetry);
    case 'tag':
      telemetry.trackCliSubcommandTag(subcommandOriginal);
      return (await import('./tags')).default(client, args, telemetry);
    case 'image':
      telemetry.trackCliSubcommandImage(subcommandOriginal);
      return (await import('./image')).default(client, args, telemetry);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(vcrCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
