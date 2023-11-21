import Client from '../../util/client.js';
import getArgs from '../../util/get-args.js';
import getInvalidSubcommand from '../../util/get-invalid-subcommand.js';
import getScope from '../../util/get-scope.js';
import handleError from '../../util/handle-error.js';
import { help } from '../help.js';
import add from './add.js';
import list from './list.js';
import rm from './rm.js';
import { projectCommand } from './command.js';

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
};

export default async function main(client: Client) {
  let argv: any;
  let subcommand: string | string[];

  try {
    argv = getArgs(client.argv.slice(2), {
      '--next': Number,
      '-N': '--next',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(
      help(projectCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  argv._ = argv._.slice(1);
  subcommand = argv._[0] || 'list';
  const args = argv._.slice(1);
  const { output } = client;
  const { contextName } = await getScope(client);

  switch (subcommand) {
    case 'ls':
    case 'list':
      return await list(client, argv, args, contextName);
    case 'add':
      return await add(client, args, contextName);
    case 'rm':
    case 'remove':
      return await rm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      client.output.print(
        help(projectCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
