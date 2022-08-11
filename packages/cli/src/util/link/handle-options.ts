import chalk from 'chalk';
import { Org, Project, ProjectSettings } from '../../types';
import Client from '../client';
import {
  connectGitProvider,
  disconnectGitProvider,
  formatProvider,
  RepoInfo,
  parseRepoUrl,
} from '../git/connect-git-provider';
import { Output } from '../output';
import { getCommandName } from '../pkg-name';
import updateProject from '../projects/update-project';

export async function handleOptions(
  option: string,
  client: Client,
  org: Org,
  project: Project,
  settings: ProjectSettings,
  repoInfo?: RepoInfo
) {
  const { output } = client;
  if (option === 'no') {
    skip(output);
    return;
  } else if (option === 'opt-out') {
    return optOut(client, project, settings);
  } else if (option !== '') {
    // Option is "yes" or a URL

    // Ensure parsed url exists
    if (!repoInfo) {
      const _repoInfo = parseRepoUrl(option);
      if (!_repoInfo) {
        output.debug(`Could not parse repo url ${option}.`);
        return 1;
      }
      repoInfo = _repoInfo;
    }
    return connect(client, org, project, repoInfo);
  }
}

async function optOut(
  client: Client,
  project: Project,
  settings: ProjectSettings
) {
  settings.skipGitConnectDuringLink = true;
  await updateProject(client, project.name, settings);
  client.output
    .log(`Opted out. You can re-enable this prompt by visiting the Settings > Git page on the
  dashboard for this Project.`);
}

function skip(output: Output) {
  output.log('Skipping...');
  output.log(
    `You can connect a Git repository in the future by running ${getCommandName(
      'git connect'
    )}.`
  );
}

async function connect(
  client: Client,
  org: Org,
  project: Project,
  repoInfo: RepoInfo
): Promise<number | void> {
  const { output } = client;
  const { provider, org: parsedOrg, repo } = repoInfo;
  const repoPath = `${parsedOrg}/${repo}`;

  output.log('Connecting...');

  if (project.link) {
    await disconnectGitProvider(client, org, project.id);
  }
  const connect = await connectGitProvider(
    client,
    org,
    project.id,
    provider,
    repoPath
  );
  if (connect !== 1) {
    output.log(
      `Connected ${formatProvider(provider)} repository ${chalk.cyan(
        repoPath
      )}!`
    );
  } else {
    return connect;
  }
}
