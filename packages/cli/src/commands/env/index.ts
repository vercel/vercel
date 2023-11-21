import chalk from 'chalk';
import Client from '../../util/client.js';
import {
  getEnvTargetPlaceholder,
  isValidEnvTarget,
} from '../../util/env/env-target.js';
import getArgs from '../../util/get-args.js';
import getInvalidSubcommand from '../../util/get-invalid-subcommand.js';
import getSubcommand from '../../util/get-subcommand.js';
import handleError from '../../util/handle-error.js';
import { help } from '../help.js';
import { getCommandName } from '../../util/pkg-name.js';
import { getLinkedProject } from '../../util/projects/link.js';

import add from './add.js';
import ls from './ls.js';
import pull from './pull.js';
import rm from './rm.js';
import { envCommand } from './command.js';

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
  pull: ['pull'],
};

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',
      '--environment': String,
      '--git-branch': String,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(help(envCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const subArgs = argv._.slice(1);
  const { subcommand, args } = getSubcommand(subArgs, COMMAND_CONFIG);
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
    switch (subcommand) {
      case 'ls':
        return ls(client, project, argv, args, output);
      case 'add':
        return add(client, project, argv, args, output);
      case 'rm':
        return rm(client, project, argv, args, output);
      case 'pull':
        return pull(
          client,
          link,
          project,
          target,
          argv,
          args,
          output,
          cwd,
          'vercel-cli:env:pull'
        );
      default:
        output.error(getInvalidSubcommand(COMMAND_CONFIG));
        client.output.print(
          help(envCommand, { columns: client.stderr.columns })
        );
        return 2;
    }
  }
}
