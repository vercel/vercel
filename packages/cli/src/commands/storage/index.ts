import { getCommandAliases } from '..';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { StorageTelemetryClient } from '../../util/telemetry/commands/storage';
import { type Command, help } from '../help';
import {
  connectSubcommand,
  createSubcommand,
  deleteSubcommand,
  disconnectSubcommand,
  getSubcommand as getStoreSubcommand,
  listSubcommand,
  statusSubcommand,
  storageCommand,
  updateSubcommand,
} from './command';
import { connect } from './connect';
import { create } from './create';
import { deleteStore } from './delete';
import { disconnect } from './disconnect';
import { get } from './get';
import { list } from './list';
import { status } from './status';
import { update } from './update';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  create: getCommandAliases(createSubcommand),
  inspect: getCommandAliases(getStoreSubcommand),
  delete: getCommandAliases(deleteSubcommand),
  connect: getCommandAliases(connectSubcommand),
  status: getCommandAliases(statusSubcommand),
  update: getCommandAliases(updateSubcommand),
  disconnect: getCommandAliases(disconnectSubcommand),
};

export default async function main(client: Client): Promise<number> {
  const telemetry = new StorageTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArguments;
  try {
    parsedArguments = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(storageCommand.options),
      { permissive: true }
    );
  } catch (error) {
    printError(error);
    return 2;
  }

  const needHelp = Boolean(parsedArguments.flags['--help']);
  const subArgs = parsedArguments.args.slice(1);
  const { subcommand, subcommandOriginal, args } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  if (!subcommand) {
    if (needHelp) {
      telemetry.trackCliFlagHelp('storage');
      output.print(
        help(storageCommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 0;
    }
    if (subArgs.length > 0) {
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
    output.print(
      help(storageCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        columns: client.stderr.columns,
        parent: storageCommand,
      })
    );
  }

  switch (subcommand) {
    case 'list': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('storage', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    }
    case 'create': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('storage', subcommandOriginal);
        printHelp(createSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, args);
    }
    case 'inspect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('storage', subcommandOriginal);
        printHelp(getStoreSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      if (subcommandOriginal === 'get') {
        warnDeprecatedSubcommand(client, 'storage get', 'storage inspect');
      }
      return get(client, args);
    }
    case 'delete': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('storage', subcommandOriginal);
        printHelp(deleteSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      return deleteStore(client, args);
    }
    case 'connect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('storage', subcommandOriginal);
        printHelp(connectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandConnect(subcommandOriginal);
      return connect(client, args);
    }
    case 'status': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('storage', subcommandOriginal);
        printHelp(statusSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandStatus(subcommandOriginal);
      return status(client, args);
    }
    case 'update': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('storage', subcommandOriginal);
        printHelp(updateSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    }
    case 'disconnect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('storage', subcommandOriginal);
        printHelp(disconnectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDisconnect(subcommandOriginal);
      return disconnect(client, args);
    }
    default: {
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}
