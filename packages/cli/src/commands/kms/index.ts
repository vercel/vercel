import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { getCommandAliases } from '..';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { KmsTelemetryClient } from '../../util/telemetry/commands/kms';
import { type Command, help } from '../help';
import output from '../../output-manager';
import ls from './ls';
import inspect from './inspect';
import add from './add';
import importIssuer from './import';
import update from './update';
import rm from './rm';
import addKey from './add-key';
import importKey from './import-key';
import activateKey from './activate-key';
import revokeKey from './revoke-key';
import addGrant from './add-grant';
import updateGrant from './update-grant';
import rmGrant from './rm-grant';
import {
  activateKeySubcommand,
  addGrantSubcommand,
  addKeySubcommand,
  addSubcommand,
  importKeySubcommand,
  importSubcommand,
  inspectSubcommand,
  kmsCommand,
  listSubcommand,
  removeGrantSubcommand,
  removeSubcommand,
  revokeKeySubcommand,
  updateGrantSubcommand,
  updateSubcommand,
} from './command';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  add: getCommandAliases(addSubcommand),
  import: getCommandAliases(importSubcommand),
  update: getCommandAliases(updateSubcommand),
  remove: getCommandAliases(removeSubcommand),
  'add-key': getCommandAliases(addKeySubcommand),
  'import-key': getCommandAliases(importKeySubcommand),
  'activate-key': getCommandAliases(activateKeySubcommand),
  'revoke-key': getCommandAliases(revokeKeySubcommand),
  'add-grant': getCommandAliases(addGrantSubcommand),
  'update-grant': getCommandAliases(updateGrantSubcommand),
  'remove-grant': getCommandAliases(removeGrantSubcommand),
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(kmsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new KmsTelemetryClient({
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
    telemetry.trackCliFlagHelp('kms');
    output.print(help(kmsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: kmsCommand, columns: client.stderr.columns })
    );
    return 2;
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(inspectSubcommand);
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'import':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(importSubcommand);
      }
      telemetry.trackCliSubcommandImport(subcommandOriginal);
      return importIssuer(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(updateSubcommand);
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    case 'add-key':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(addKeySubcommand);
      }
      telemetry.trackCliSubcommandAddKey(subcommandOriginal);
      return addKey(client, args);
    case 'import-key':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(importKeySubcommand);
      }
      telemetry.trackCliSubcommandImportKey(subcommandOriginal);
      return importKey(client, args);
    case 'activate-key':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(activateKeySubcommand);
      }
      telemetry.trackCliSubcommandActivateKey(subcommandOriginal);
      return activateKey(client, args);
    case 'revoke-key':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(revokeKeySubcommand);
      }
      telemetry.trackCliSubcommandRevokeKey(subcommandOriginal);
      return revokeKey(client, args);
    case 'add-grant':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(addGrantSubcommand);
      }
      telemetry.trackCliSubcommandAddGrant(subcommandOriginal);
      return addGrant(client, args);
    case 'update-grant':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(updateGrantSubcommand);
      }
      telemetry.trackCliSubcommandUpdateGrant(subcommandOriginal);
      return updateGrant(client, args);
    case 'remove-grant':
      if (needHelp) {
        telemetry.trackCliFlagHelp('kms', subcommandOriginal);
        return printHelp(removeGrantSubcommand);
      }
      telemetry.trackCliSubcommandRemoveGrant(subcommandOriginal);
      return rmGrant(client, args);
    default:
      // Bare `vercel kms` runs the default subcommand. Anything else reaching
      // here is a mistyped subcommand, not an argument to `list`.
      if (args.length > 0) {
        output.error(getInvalidSubcommand(COMMAND_CONFIG));
        output.print(help(kmsCommand, { columns: client.stderr.columns }));
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
