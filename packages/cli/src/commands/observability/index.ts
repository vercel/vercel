import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import { help } from '../help';
import { notebooksSubcommand, observabilityCommand } from './command';
import notebooks from './notebooks';

const COMMAND_CONFIG = {
  notebooks: getCommandAliases(notebooksSubcommand),
};

export default async function observability(client: Client): Promise<number> {
  let parsed;
  try {
    parsed = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(observabilityCommand.options),
      { permissive: true }
    );
  } catch (error) {
    printError(error);
    return 1;
  }

  const { subcommand, args } = getSubcommand(
    parsed.args.slice(1),
    COMMAND_CONFIG
  );
  if (parsed.flags['--help']) {
    output.print(
      help(observabilityCommand, { columns: client.stderr.columns })
    );
    return 0;
  }

  if (subcommand === 'notebooks') {
    return notebooks(client, args);
  }

  output.error('Usage: vercel observability notebooks <action>');
  return 2;
}
