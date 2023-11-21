import Client from '../../util/client.js';
import getArgs from '../../util/get-args.js';
import getSubcommand from '../../util/get-subcommand.js';
import handleError from '../../util/handle-error.js';
import add from './add.js';
import buy from './buy.js';
import transferIn from './transfer-in.js';
import inspect from './inspect.js';
import ls from './ls.js';
import rm from './rm.js';
import move from './move.js';
import { domainsCommand } from './command.js';
import { help } from '../help.js';

const COMMAND_CONFIG = {
  add: ['add'],
  buy: ['buy'],
  inspect: ['inspect'],
  ls: ['ls', 'list'],
  move: ['move'],
  rm: ['rm', 'remove'],
  transferIn: ['transfer-in'],
};

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--code': String,
      '--yes': Boolean,
      '--force': Boolean,
      '--next': Number,
      '-N': '--next',
      '-y': '--yes',
      '--limit': Number,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(
      help(domainsCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);
  switch (subcommand) {
    case 'add':
      return add(client, argv, args);
    case 'inspect':
      return inspect(client, argv, args);
    case 'move':
      return move(client, argv, args);
    case 'buy':
      return buy(client, argv, args);
    case 'rm':
      return rm(client, argv, args);
    case 'transferIn':
      return transferIn(client, argv, args);
    default:
      return ls(client, argv, args);
  }
}
