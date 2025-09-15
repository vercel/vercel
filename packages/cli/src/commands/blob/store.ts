import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import {
  addStoreSubcommand,
  getStoreSubcommand,
  removeStoreSubcommand,
  storeSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import addStore from './store-add';
import removeStore from './store-remove';
import { BlobStoreTelemetryClient } from '../../util/telemetry/commands/blob/store';
import { printError } from '../../util/error';
import getStore from './store-get';
import type { BlobRWToken } from '../../util/blob/token';

const COMMAND_CONFIG = {
  add: getCommandAliases(addStoreSubcommand),
  remove: getCommandAliases(removeStoreSubcommand),
  get: getCommandAliases(getStoreSubcommand),
};

export async function store(client: Client, rwToken: BlobRWToken) {
  const telemetry = new BlobStoreTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(storeSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(2);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('blob store', subcommand);
    output.print(help(storeSubcommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: storeSubcommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob store', subcommandOriginal);
        printHelp(addStoreSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return addStore(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob store', subcommandOriginal);
        printHelp(removeStoreSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return removeStore(client, args, rwToken);
    case 'get':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob store', subcommandOriginal);
        printHelp(getStoreSubcommand);
        return 2;
      }

      telemetry.trackCliSubcommandGet(subcommandOriginal);
      return getStore(client, args, rwToken);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(storeSubcommand, { columns: client.stderr.columns }));
      return 2;
  }
}
