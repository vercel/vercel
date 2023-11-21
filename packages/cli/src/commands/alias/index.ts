import { handleError } from '../../util/error.js';
import Client from '../../util/client.js';
import getArgs from '../../util/get-args.js';
import getSubcommand from '../../util/get-subcommand.js';
import { help } from '../help.js';
import ls from './ls.js';
import rm from './rm.js';
import set from './set.js';
import { aliasCommand } from './command.js';

const COMMAND_CONFIG = {
  default: ['set'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
  set: ['set'],
};

export default async function alias(client: Client) {
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
