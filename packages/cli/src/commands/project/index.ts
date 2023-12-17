import Client from '../../util/client';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getScope from '../../util/get-scope';
import handleError from '../../util/handle-error';
import { help } from '../help';
import add from './add';
import list from './list';
import rm from './rm';
import { projectCommand } from './command';

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
      '--deprecated': Boolean,
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
