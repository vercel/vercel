import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { help } from '../help';
import { add } from './add';
import { integrationCommand } from './command';
import { list } from './list';
import { openIntegration } from './open-integration';
import { remove } from './remove';

const COMMAND_CONFIG = {
  add: ['add'],
  open: ['open'],
  list: ['list', 'ls'],
  remove: ['remove', 'rm'],
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

  if (flags['--help']) {
    client.output.print(
      help(integrationCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  switch (subcommand) {
    case 'add': {
      return add(client, subArgs);
    }
    case 'list': {
      return list(client);
    }
    case 'open': {
      return openIntegration(client, subArgs);
    }
    case 'remove': {
      return remove(client);
    }
    default: {
      client.output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}
