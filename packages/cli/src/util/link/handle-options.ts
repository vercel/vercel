import chalk from 'chalk';
import { Org, Project, ProjectSettings } from '../../types';
import Client from '../client';
import {
  connectGitProvider,
  disconnectGitProvider,
  formatProvider,
  ParsedRepoUrl,
  parseRepoUrl,
} from '../git/connect-git-provider';
import { Output } from '../output';
import { getCommandName } from '../pkg-name';
import updateProject from '../projects/update-project';

export async function handleOptions(
  option: string,
  client: Client,
  output: Output,
  org: Org,
  project: Project,
  settings: ProjectSettings,
  parsedUrl?: ParsedRepoUrl
) {
  if (option === 'no') {
    return skip(output);
  } else if (option === 'opt-out') {
    return optOut(client, project, settings);
  } else if (option !== '') {
    // Option is "yes" or a URL

    // Ensure parsed url exists
    if (!parsedUrl) {
      const _parsedUrl = parseRepoUrl(option);
      if (!_parsedUrl) {
        output.debug(`Could not parse repo url ${option}.`);
        return 1;
      }
      parsedUrl = _parsedUrl;
    }
    return connect(client, output, org, project, parsedUrl);
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
  output: Output,
  org: Org,
  project: Project,
  parsedUrl: ParsedRepoUrl
): Promise<number | void> {
  const { provider, org: parsedOrg, repo } = parsedUrl;
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
