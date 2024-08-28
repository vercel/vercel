import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { help } from '../help';
import { add } from './add';
import { integrationCommand } from './command';

const COMMAND_CONFIG = {
  add: ['add'],
};

export default async function main(client: Client) {
  const { args, flags } = parseArguments(client.argv.slice(2));
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
    default: {
      client.output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}
