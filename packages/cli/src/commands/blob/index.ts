import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import list from './list';
import {
  blobCommand,
  delSubcommand,
  listSubcommand,
  putSubcommand,
  copySubcommand,
  newStoreSubcommand,
  removeStoreSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { BlobTelemetryClient } from '../../util/telemetry/commands/blob';
import put from './put';
import del from './del';
import copy from './copy';
import newStore from './new';
import removeStore from './remove';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  put: getCommandAliases(putSubcommand),
  del: getCommandAliases(delSubcommand),
  copy: getCommandAliases(copySubcommand),
  new: getCommandAliases(newStoreSubcommand),
  remove: getCommandAliases(removeStoreSubcommand),
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

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'put':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(putSubcommand);
        return 2;
      }
      return put(client, args);
    case 'del':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(delSubcommand);
        return 2;
      }
      return del(client, args);
    case 'copy':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(copySubcommand);
        return 2;
      }
      return copy(client, args);
    case 'new':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(newStoreSubcommand);
        return 2;
      }
      return newStore(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(removeStoreSubcommand);
        return 2;
      }
      return removeStore(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(blobCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
