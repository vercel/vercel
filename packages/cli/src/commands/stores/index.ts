import Client from '../../util/client';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import { getLinkedProject } from '../../util/projects/link';
import { help } from '../help';

import { storesCommand } from './command';
import { create } from './create';
import { list } from './list';

const COMMAND_CONFIG = {
  create: ['create'],
  list: ['list', 'ls'],
};

export const STORAGE_API_PATH = '/v1/storage';

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--name': String,
      '--n': '--name',

      '--type': String,
      '--t': '--type',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(
      help(storesCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  const subArgs = argv._.slice(1);
  const { subcommand } = getSubcommand(subArgs, COMMAND_CONFIG);
  const { cwd, output } = client;

  const link = await getLinkedProject(client, cwd);

  if (link.status === 'error') {
    return link.exitCode;
  }

  if (link.status === 'linked') {
    client.config.currentTeam =
      link.org.type === 'team' ? link.org.id : undefined;
  }

  switch (subcommand) {
    case 'create':
      return create({ opts: argv, client, projectLink: link });
    case 'list':
      return list({ client });
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      client.output.print(
        help(storesCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
