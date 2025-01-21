import chalk from 'chalk';

import { getCommandName } from '../../util/pkg-name';
import { disconnectGitProvider } from '../../util/git/connect-git-provider';
import output from '../../output-manager';
import { disconnectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { GitDisconnectTelemetryClient } from '../../util/telemetry/commands/git/disconnect';
import type Client from '../../util/client';
import { ensureLink } from '../../util/link/ensure-link';

export default async function disconnect(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    disconnectSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const telemetry = new GitDisconnectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetry.trackCliFlagConfirm(opts['--confirm']);
  telemetry.trackCliFlagYes(opts['--yes']);

  if ('--confirm' in opts) {
    output.warn('`--confirm` is deprecated, please use `--yes` instead');
    opts['--yes'] = opts['--confirm'];
  }

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project disconnect')}`
      )}`
    );
    return 2;
  }

  const autoConfirm = Boolean(parsedArgs.flags['--yes']);
  const linkedProject = await ensureLink('git', client, client.cwd, {
    autoConfirm,
  });
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  const { org, project } = linkedProject;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  if (project.link) {
    const { org: linkOrg, repo } = project.link;
    output.print(
      `Your Vercel project will no longer create deployments when you push to this repository.\n`
    );
    const confirmDisconnect =
      autoConfirm ||
      (await client.input.confirm(
        `Are you sure you want to disconnect ${chalk.cyan(
          `${linkOrg}/${repo}`
        )} from your project?`,
        false
      ));

    if (confirmDisconnect) {
      await disconnectGitProvider(client, org, project.id);
      output.log(`Disconnected ${chalk.cyan(`${linkOrg}/${repo}`)}.`);
    } else {
      output.log('Canceled');
    }
  } else {
    output.error(
      `No Git repository connected. Run ${getCommandName(
        'project connect'
      )} to connect one.`
    );
    return 1;
  }

  return 0;
}
