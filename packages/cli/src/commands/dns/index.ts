import Client from '../../util/client';
import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';

import add from './add';
import importZone from './import';
import ls from './ls';
import rm from './rm';
import { dnsCommand } from './command';
import { help } from '../help';

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
