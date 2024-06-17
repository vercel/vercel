import Client from '../../util/client';
import getArgs from '../../util/get-args';
import { help } from '../help';
import { installCommand } from './command';
import add from './add';
import handleError from '../../util/handle-error';
import chalk from 'chalk';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
} from '../../util/env/env-target';
import getSubcommand from '../../util/get-subcommand';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';

const COMMAND_CONFIG = {
  add: ['add'],
  rm: ['rm', 'remove'],
};

export default async function link(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',
      '--environment': String,
      '--git-branch': String,
      '--sensitive': Boolean,
      '--force': Boolean,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(
      help(installCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  const subArgs = argv._.slice(1);
  const { args } = getSubcommand(subArgs, COMMAND_CONFIG);
  const { cwd, output, config } = client;

  const target = argv['--environment']?.toLowerCase() || 'development';
  if (!isValidEnvTarget(target)) {
    output.error(
      `Invalid environment \`${chalk.cyan(
        target
      )}\`. Valid options: ${getEnvTargetPlaceholder()}`
    );
    return 1;
  }
  const link = await getLinkedProject(client, cwd);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  } else {
    const { project, org } = link;
    config.currentTeam = org.type === 'team' ? org.id : undefined;
    // Hardcoded default for now
    let subcommand = 'add';

    switch (subcommand) {
      case 'add':
        return add(client, project, args, output);

      default:
        output.error(getInvalidSubcommand(COMMAND_CONFIG));
        client.output.print(
          help(installCommand, { columns: client.stderr.columns })
        );
        return 2;
    }
  }

  return 0;
}
