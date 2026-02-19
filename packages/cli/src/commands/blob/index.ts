import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import resolveSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import list from './list';
import {
  blobCommand,
  delSubcommand,
  getSubcommand,
  listSubcommand,
  putSubcommand,
  copySubcommand,
  createStoreSubcommand,
  deleteStoreSubcommand,
  getStoreInfoSubcommand,
  storeSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { BlobTelemetryClient } from '../../util/telemetry/commands/blob';
import put from './put';
import get from './get';
import del from './del';
import copy from './copy';
import { store } from './store';
import addStore from './store-add';
import removeStore from './store-remove';
import getStore from './store-get';
import { printError } from '../../util/error';
import { getBlobRWToken } from '../../util/blob/token';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  put: getCommandAliases(putSubcommand),
  get: getCommandAliases(getSubcommand),
  del: getCommandAliases(delSubcommand),
  copy: getCommandAliases(copySubcommand),
  'create-store': getCommandAliases(createStoreSubcommand),
  'delete-store': getCommandAliases(deleteStoreSubcommand),
  'get-store': getCommandAliases(getStoreInfoSubcommand),
  store: getCommandAliases(storeSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new BlobTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(blobCommand.options);
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
  const { subcommand, args, subcommandOriginal } = resolveSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('blob', subcommand);
    output.print(help(blobCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: blobCommand, columns: client.stderr.columns })
    );
  }

  const token = await getBlobRWToken(client, client.argv);
  telemetry.trackCliOptionRwToken();

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandList(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return list(client, args, token.token);
    case 'put':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(putSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandPut(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return put(client, args, token.token);
    case 'get':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(getSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandGet(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return get(client, args, token.token);
    case 'del':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(delSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandDel(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return del(client, args, token.token);
    case 'copy':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(copySubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandCopy(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return copy(client, args, token.token);
    case 'create-store':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(createStoreSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandCreateStore(subcommandOriginal);

      return addStore(client, args);
    case 'delete-store':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(deleteStoreSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandDeleteStore(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return removeStore(client, args, token);
    case 'get-store':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(getStoreInfoSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandGetStore(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return getStore(client, args, token);
    case 'store':
      output.warn(
        '`vercel blob store` is deprecated. Use `vercel blob create-store`, `vercel blob delete-store`, or `vercel blob get-store` instead.'
      );
      telemetry.trackCliSubcommandStore(subcommandOriginal);
      return store(client, token);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(blobCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
