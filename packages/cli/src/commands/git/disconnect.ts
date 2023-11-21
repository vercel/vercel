import chalk from 'chalk';
import { Org, Project } from '@vercel-internals/types';
import Client from '../../util/client.js';
import confirm from '../../util/input/confirm.js';
import { getCommandName } from '../../util/pkg-name.js';
import { disconnectGitProvider } from '../../util/git/connect-git-provider.js';

export default async function disconnect(
  client: Client,
  args: string[],
  project: Project | undefined,
  org: Org | undefined
) {
  const { output } = client;

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project disconnect')}`
      )}`
    );
    return 2;
  }
  if (!project || !org) {
    output.error('An unexpected error occurred.');
    return 1;
  }

  if (project.link) {
    const { org: linkOrg, repo } = project.link;
    output.print(
      `Your Vercel project will no longer create deployments when you push to this repository.\n`
    );
    const confirmDisconnect = await confirm(
      client,
      `Are you sure you want to disconnect ${chalk.cyan(
        `${linkOrg}/${repo}`
      )} from your project?`,
      false
    );

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
