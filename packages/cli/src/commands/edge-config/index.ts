import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import listCmd from './list';
import addCmd from './add';
import getCmd from './get';
import updateCmd from './update';
import removeCmd from './remove';
import itemsCmd from './items';
import tokensCmd from './tokens';
import {
  edgeConfigCommand,
  listSubcommand,
  addSubcommand,
  getSubcommand as getSubcommandDef,
  updateSubcommand,
  removeSubcommand,
  itemsSubcommand,
  tokensSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { EdgeConfigTelemetryClient } from '../../util/telemetry/commands/edge-config';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  list: ['list', 'ls'],
  add: ['add', 'create'],
  get: ['get', 'inspect'],
  update: ['update'],
  remove: ['remove', 'rm', 'delete'],
  items: ['items'],
  tokens: ['tokens'],
};

export default async function main(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(edgeConfigCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new EdgeConfigTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('edge-config');
    output.print(help(edgeConfigCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command): number {
    output.print(
      help(command, {
        parent: edgeConfigCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('edge-config', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return addCmd(client, args);
    case 'get':
      if (needHelp) {
        telemetry.trackCliFlagHelp('edge-config', subcommandOriginal);
        return printHelp(getSubcommandDef);
      }
      telemetry.trackCliSubcommandGet(subcommandOriginal);
      return getCmd(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('edge-config', subcommandOriginal);
        return printHelp(updateSubcommand);
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return updateCmd(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('edge-config', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return removeCmd(client, args);
    case 'items':
      if (needHelp) {
        telemetry.trackCliFlagHelp('edge-config', subcommandOriginal);
        return printHelp(itemsSubcommand);
      }
      telemetry.trackCliSubcommandItems(subcommandOriginal);
      return itemsCmd(client, args);
    case 'tokens':
      if (needHelp) {
        telemetry.trackCliFlagHelp('edge-config', subcommandOriginal);
        return printHelp(tokensSubcommand);
      }
      telemetry.trackCliSubcommandTokens(subcommandOriginal);
      return tokensCmd(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('edge-config', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return listCmd(client, args);
  }
}
