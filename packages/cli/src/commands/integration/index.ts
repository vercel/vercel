import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { add } from './add';
import {
  addSubcommand,
  deleteSubcommand,
  disconnectSubcommand,
  integrationCommand,
  listSubcommand,
  openSubcommand,
  uninstallSubcommand,
} from './command';
import { deleteResource } from './delete-resource';
import { disconnect } from './disconnect';
import { list } from './list';
import { openIntegration } from './open-integration';
import { uninstall } from './uninstall';

const COMMAND_CONFIG = {
  add: ['add'],
  open: ['open'],
  list: ['list', 'ls'],
  delete: ['delete', 'rm'],
  uninstall: ['uninstall'],
  disconnect: ['disconnect'],
};

export default async function main(client: Client) {
  const { args, flags } = parseArguments(
    client.argv.slice(2),
    getFlagsSpecification(integrationCommand.options),
    { permissive: true }
  );
  const { subcommand, args: subArgs } = getSubcommand(
    args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = flags['--help'];

  if (!subcommand && needHelp) {
    client.output.print(
      help(integrationCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  function printHelp(command: Command) {
    client.output.print(help(command, { columns: client.stderr.columns }));
  }

  switch (subcommand) {
    case 'add': {
      if (needHelp) {
        printHelp(addSubcommand);
        return 2;
      }
      return add(client, subArgs);
    }
    case 'list': {
      if (needHelp) {
        printHelp(listSubcommand);
        return 2;
      }
      return list(client);
    }
    case 'open': {
      if (needHelp) {
        printHelp(openSubcommand);
        return 2;
      }
      return openIntegration(client, subArgs);
    }
    case 'uninstall': {
      if (needHelp) {
        printHelp(uninstallSubcommand);
        return 2;
      }
      return uninstall(client);
    }
    case 'delete': {
      if (needHelp) {
        printHelp(deleteSubcommand);
        return 2;
      }
      return deleteResource(client);
    }
    case 'disconnect': {
      if (needHelp) {
        printHelp(disconnectSubcommand);
        return 2;
      }
      return disconnect(client);
    }
    default: {
      client.output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}
