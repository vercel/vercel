import Client from '../../util/client.js';
import getArgs from '../../util/get-args.js';
import getSubcommand from '../../util/get-subcommand.js';
import handleError from '../../util/handle-error.js';

import add from './add.js';
import importZone from './import.js';
import ls from './ls.js';
import rm from './rm.js';
import { dnsCommand } from './command.js';
import { help } from '../help.js';

const COMMAND_CONFIG = {
  add: ['add'],
  import: ['import'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
};

export default async function dns(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--next': Number,
      '-N': '--next',
      '--limit': Number,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(help(dnsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);
  switch (subcommand) {
    case 'add':
      return add(client, argv, args);
    case 'import':
      return importZone(client, argv, args);
    case 'rm':
      return rm(client, argv, args);
    default:
      return ls(client, argv, args);
  }
}
