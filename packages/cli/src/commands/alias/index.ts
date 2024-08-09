import { handleError } from '../../util/error';
import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { help } from '../help';
import ls from './ls';
import rm from './rm';
import set from './set';
import { aliasCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';

const COMMAND_CONFIG = {
  default: ['set'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
  set: ['set'],
};

export default async function alias(client: Client) {
  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(aliasCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (parsedArguments.flags['--help']) {
    client.output.print(help(aliasCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { subcommand, args } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  switch (subcommand) {
    case 'ls':
      return ls(client, parsedArguments.flags, args);
    case 'rm':
      return rm(client, parsedArguments.flags, args);
    default:
      return set(client, parsedArguments.flags, args);
  }
}
