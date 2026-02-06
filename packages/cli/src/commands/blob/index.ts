import output from '../../output-manager';
import { getBlobRWToken } from '../../util/blob/token';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { BlobTelemetryClient } from '../../util/telemetry/commands/blob';
import { getCommandAliases } from '..';
import { type Command, help } from '../help';
import {
  blobCommand,
  copySubcommand,
  delSubcommand,
  listSubcommand,
  putSubcommand,
  storeSubcommand,
} from './command';
import copy from './copy';
import del from './del';
import list from './list';
import put from './put';
import { store } from './store';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  put: getCommandAliases(putSubcommand),
  del: getCommandAliases(delSubcommand),
  copy: getCommandAliases(copySubcommand),
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
  const { subcommand, args, subcommandOriginal } = getSubcommand(
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
    case 'store':
      telemetry.trackCliSubcommandStore(subcommandOriginal);
      return store(client, token);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(blobCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
