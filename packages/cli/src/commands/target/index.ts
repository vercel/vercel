import Client from '../../util/client';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { help } from '../help';
import list from './list';
import { targetCommand } from './command';
import { ensureLink } from '../../util/link/ensure-link';

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
};

export default async function main(client: Client) {
  let subcommand: string | string[];

  const argv = getArgs(client.argv.slice(2), {
    '--next': Number,
    '-N': '--next',
  });

  if (argv['--help']) {
    client.output.print(
      help(targetCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  argv._ = argv._.slice(1);
  subcommand = argv._[0] || 'list';
  const args = argv._.slice(1);
  const { cwd, output } = client;

  const linkedProject = await ensureLink(targetCommand.name, client, cwd);
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  switch (subcommand) {
    case 'ls':
    case 'list':
      return await list(client, argv, args, linkedProject);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      client.output.print(
        help(targetCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
