import Client from '../../util/client';
import { ensureLink } from '../../util/link/ensure-link';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import handleError from '../../util/handle-error';
import connect from './connect';
import disconnect from './disconnect';
import { help } from '../help';
import { gitCommand } from './command';

const COMMAND_CONFIG = {
  connect: ['connect'],
  disconnect: ['disconnect'],
};

export default async function main(client: Client) {
  let argv: any;
  let subcommand: string | string[];

  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',

      // deprecated
      '-c': '--yes',
      '--confirm': '--yes',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(help(gitCommand, { columns: client.stderr.columns }));
    return 2;
  }

  argv._ = argv._.slice(1);
  subcommand = argv._[0];
  const args = argv._.slice(1);
  const autoConfirm = Boolean(argv['--yes']);
  const { cwd, output } = client;

  const linkedProject = await ensureLink('git', client, cwd, { autoConfirm });
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  const { org, project } = linkedProject;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  switch (subcommand) {
    case 'connect':
      return await connect(client, argv, args, project, org);
    case 'disconnect':
      return await disconnect(client, args, project, org);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      client.output.print(help(gitCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
