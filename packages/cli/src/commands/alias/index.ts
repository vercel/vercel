import { handleError } from '../../util/error';
import Client from '../../util/client';
import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { help } from '../help';
import ls from './ls';
import rm from './rm';
import set from './set';
import { aliasCommand } from './command';

const COMMAND_CONFIG = {
  default: ['set'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
  set: ['set'],
};

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--json': Boolean,
      '--yes': Boolean,
      '--next': Number,
      '--limit': Number,
      '-y': '--yes',
      '-N': '--next',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(help(aliasCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);

  switch (subcommand) {
    case 'ls':
      return ls(client, argv, args);
    case 'rm':
      return rm(client, argv, args);
    default:
      return set(client, argv, args);
  }
}
