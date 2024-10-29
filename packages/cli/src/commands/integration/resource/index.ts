import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { type Command, help } from '../../help';
import {
  removeSubcommand,
  disconnectSubcommand,
  integrationResourceCommand,
} from './command';
import { remove } from './remove-resource';
import { disconnect } from './disconnect';

const COMMAND_CONFIG = {
  remove: ['remove', 'rm'],
  disconnect: ['disconnect'],
};

export default async function main(client: Client) {
  const { args, flags } = parseArguments(
    client.argv.slice(2),
    getFlagsSpecification(integrationResourceCommand.options),
    { permissive: true }
  );
  const { subcommand } = getSubcommand(args.slice(1), COMMAND_CONFIG);

  const needHelp = flags['--help'];

  if (!subcommand && needHelp) {
    client.output.print(
      help(integrationResourceCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  function printHelp(command: Command) {
    client.output.print(help(command, { columns: client.stderr.columns }));
  }

  switch (subcommand) {
    case 'remove': {
      if (needHelp) {
        printHelp(removeSubcommand);
        return 2;
      }
      return remove(client);
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
