import chalk from 'chalk';
import { Org, Project, Team } from '../../types';
import Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { disconnectGitProvider } from '../../util/projects/connect-git-provider';

export default async function disconnect(
  client: Client,
  args: string[],
  project: Project | undefined,
  org: Org | undefined,
  team: Team | null
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

  await disconnectGitProvider(client, team, project.id);
}
