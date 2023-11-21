import { handleError } from '../../util/error.js';

import getArgs from '../../util/get-args.js';
import getSubcommand from '../../util/get-subcommand.js';

import add from './add.js';
import issue from './issue.js';
import ls from './ls.js';
import rm from './rm.js';
import { certsCommand } from './command.js';
import { help } from '../help.js';
import Client from '../../util/client.js';

const COMMAND_CONFIG = {
  add: ['add'],
  issue: ['issue'],
  ls: ['ls', 'list'],
  renew: ['renew'],
  rm: ['rm', 'remove'],
};

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--challenge-only': Boolean,
      '--overwrite': Boolean,
      '--output': String,
      '--crt': String,
      '--key': String,
      '--ca': String,
      '--next': Number,
      '-N': '--next',
      '--limit': Number,
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(help(certsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { output } = client;
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);
  switch (subcommand) {
    case 'issue':
      return issue(client, argv, args);
    case 'ls':
      return ls(client, argv, args);
    case 'rm':
      return rm(client, argv, args);
    case 'add':
      return add(client, argv, args);
    case 'renew':
      output.error('Renewing certificates is deprecated, issue a new one.');
      return 1;
    default:
      output.error('Please specify a valid subcommand: ls | issue | rm');
      client.output.print(
        help(certsCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
