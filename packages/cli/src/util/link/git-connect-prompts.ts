import { Dictionary } from '@vercel/client';
import chalk from 'chalk';
import { Project } from '../../types';
import Client from '../client';
import { formatProvider } from '../git/connect-git-provider';
import list from '../input/list';
export async function promptGitConnectSingleUrl(
  client: Client,
  project: Project,
  remoteName: string,
  remoteUrl: string,
  hasDiffConnectedProvider = false
) {
  const { output } = client;
  if (hasDiffConnectedProvider) {
    const currentRepoPath = `${project.link!.org}/${project.link!.repo}`;
    const currentProvider = project.link!.type;
    output.print('\n');
    output.log(
      `Found Git remote URL ${chalk.cyan(
        remoteUrl
      )}, which is different from the connected ${formatProvider(
        currentProvider
      )} repository ${chalk.cyan(currentRepoPath)}.`
    );
  } else {
    output.print('\n');
    output.log(
      `Found local Git remote "${remoteName}": ${chalk.cyan(remoteUrl)}`
    );
  }
  return await list(client, {
    message: hasDiffConnectedProvider
      ? 'Do you want to replace it?'
      : `Do you want to connect "${remoteName}" to your Vercel project?`,
    choices: [
      {
        name: 'Yes',
        value: 'yes',
        short: 'yes',
      },
      {
        name: 'No',
        value: 'no',
        short: 'no',
      },
      {
        name: 'Do not ask again for this project',
        value: 'opt-out',
        short: 'no (opt out)',
      },
    ],
  });
}

export async function promptGitConnectMultipleUrls(
  client: Client,
  remoteUrls: Dictionary<string>
) {
  const staticOptions = [
    {
      name: 'No',
      value: 'no',
      short: 'no',
    },
    {
      name: 'Do not ask again for this project',
      value: 'opt-out',
      short: 'no (opt out)',
    },
  ];
  let choices = [];
  for (const url of Object.values(remoteUrls)) {
    choices.push({
      name: url,
      value: url,
      short: url,
    });
  }
  choices = choices.concat(staticOptions);

  return await list(client, {
    message: 'Do you want to connect a Git repository to your Vercel project?',
    choices,
  });
}
