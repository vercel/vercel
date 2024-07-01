import chalk from 'chalk';
import Client from '../../util/client';
import {
  getEnvTargetPlaceholder,
  isValidEnvTarget,
} from '../../util/env/env-target';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import { help } from '../help';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';

import add from './add';
import ls from './ls';
import pull from './pull';
import rm from './rm';
import { envCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
  pull: ['pull'],
};

export default async function main(client: Client) {
  let parsedArgs;
  let argv;

  const flagsSpecification = getFlagsSpecification(envCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    client.output.print(help(envCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args } = getSubcommand(subArgs, COMMAND_CONFIG);
  const { cwd, output, config } = client;

  const target =
    parsedArgs.flags['--environment']?.toLowerCase() || 'development';
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
        return ls(client, project, parsedArgs.flags, args, output);
      case 'add':
        return add(client, project, parsedArgs.flags, args, output);
      case 'rm':
        return rm(client, project, parsedArgs.flags, args, output);
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
