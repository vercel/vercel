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
import backupsCmd from './backups';
import {
  globalConfigCommand,
  listSubcommand,
  addSubcommand,
  getSubcommand as getSubcommandDef,
  updateSubcommand,
  removeSubcommand,
  itemsSubcommand,
  tokensSubcommand,
  backupsSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { GlobalConfigTelemetryClient } from '../../util/telemetry/commands/global-config';
import output from '../../output-manager';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { applyLinkedProjectTeam } from './apply-linked-project-team';

const COMMAND_CONFIG = {
  list: ['list', 'ls'],
  add: ['add', 'create'],
  inspect: ['inspect', 'get'],
  update: ['update'],
  delete: ['delete', 'rm', 'del', 'remove'],
  items: ['items'],
  tokens: ['tokens'],
  backups: ['backups'],
};

export default async function main(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(globalConfigCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 2;
  }

  if (parsedArgs.args[0] === 'edge-config') {
    warnDeprecatedSubcommand(client, 'edge-config', 'global-config');
  }

  const telemetry = new GlobalConfigTelemetryClient({
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
    telemetry.trackCliFlagHelp('global-config');
    output.print(
      help(globalConfigCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command): number {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: globalConfigCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  // Global Configs live at the team level. When the current directory is
  // linked to a Vercel project, prefer that project's team over the
  // globally-configured `currentTeam` so commands target the team the
  // user is "in" — same convention as `vc env`, `vc crons`, etc.
  if (!needHelp) {
    const linkExitCode = await applyLinkedProjectTeam(client);
    if (linkExitCode !== undefined) {
      return linkExitCode;
    }
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('global-config', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      if (subcommandOriginal === 'add') {
        warnDeprecatedSubcommand(
          client,
          'global-config add',
          'global-config create'
        );
      }
      return addCmd(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('global-config', subcommandOriginal);
        return printHelp(getSubcommandDef);
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      if (subcommandOriginal === 'get') {
        warnDeprecatedSubcommand(
          client,
          'global-config get',
          'global-config inspect'
        );
      }
      return getCmd(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('global-config', subcommandOriginal);
        return printHelp(updateSubcommand);
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return updateCmd(client, args);
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp('global-config', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(
          client,
          'global-config remove',
          'global-config delete'
        );
      }
      return removeCmd(client, args);
    case 'items':
      if (needHelp) {
        telemetry.trackCliFlagHelp('global-config', subcommandOriginal);
        return printHelp(itemsSubcommand);
      }
      telemetry.trackCliSubcommandItems(subcommandOriginal);
      return itemsCmd(client, args);
    case 'tokens':
      if (needHelp) {
        telemetry.trackCliFlagHelp('global-config', subcommandOriginal);
        return printHelp(tokensSubcommand);
      }
      telemetry.trackCliSubcommandTokens(subcommandOriginal);
      return tokensCmd(client, args);
    case 'backups':
      if (needHelp) {
        telemetry.trackCliFlagHelp('global-config', subcommandOriginal);
        return printHelp(backupsSubcommand);
      }
      telemetry.trackCliSubcommandBackups(subcommandOriginal);
      return backupsCmd(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('global-config', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return listCmd(client, args);
  }
}
