import Client from '../../util/client';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import handleError from '../../util/handle-error';
import { help } from '../help';
import list from './list';
import { targetCommand } from './command';
import { getLinkedProject } from '../../util/projects/link';

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
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
      help(targetCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  argv._ = argv._.slice(1);
  subcommand = argv._[0] || 'list';
  const args = argv._.slice(1);
  const { cwd, output } = client;
  const link = await getLinkedProject(client, cwd);

  if (link.status === 'error') {
    return link.exitCode;
  }

  if (link.status === 'not_linked') {
    // TODO: prompt for link
    output.error('Project not linked');
    return 1;
  }

  switch (subcommand) {
    case 'ls':
    case 'list':
      return await list(client, argv, args, link);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      client.output.print(
        help(targetCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
