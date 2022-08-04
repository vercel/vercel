import { Dictionary } from '@vercel/client';
import {
  connectGitProvider,
  disconnectGitProvider,
  formatProvider,
  parseRepoUrl,
} from '../git/connect-git-provider';
import { Output } from '../output';
import list from '../input/list';
import Client from '../client';
import { Org, Project, ProjectSettings } from '../../types';
import { getCommandName } from '../pkg-name';
import updateProject from '../projects/update-project';
import chalk from 'chalk';

export async function handleGitConnection(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings?: ProjectSettings
): Promise<number | void> {
  if (Object.keys(remoteUrls).length === 1) {
    return addSingleGitRemote(
      client,
      org,
      output,
      project,
      remoteUrls,
      settings || project
    );
  } else if (Object.keys(remoteUrls).length > 1 && !project.link) {
    return addMultipleGitRemotes(
      client,
      org,
      output,
      project,
      remoteUrls,
      settings || project
    );
  }
}

async function addSingleGitRemote(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings: ProjectSettings
) {
  const remoteUrl = Object.values(remoteUrls)[0];
  const parsedUrl = parseRepoUrl(remoteUrl);
  if (!parsedUrl) {
    output.debug(`Could not parse repo url ${parsedUrl}.`);
    return;
  }
  const { org: parsedOrg, repo, provider } = parsedUrl;
  const alreadyLinked =
    project.link?.org === parsedOrg &&
    project.link.repo === repo &&
    project.link.type === provider;
  if (alreadyLinked) {
    output.debug('Project already linked. Skipping...');
    return;
  }

  const replace =
    project.link &&
    (project.link.org !== parsedOrg ||
      project.link.repo !== repo ||
      project.link.type !== provider);
  if (replace) {
    const currentRepoPath = `${project.link!.org}/${project.link!.repo}`;
    const currentProvider = project.link!.type;
    output.log(
      `Found Git remote url ${chalk.cyan(
        remoteUrl
      )}, which is different from the connected ${formatProvider(
        currentProvider
      )} repository ${chalk.cyan(currentRepoPath)}.`
    );
  } else {
    output.log(`Found local Git remote URL: ${chalk.cyan(remoteUrl)}`);
  }
  const shouldConnect = await promptGitConnectSingleUrl(client, replace);
  return handleOptions(
    shouldConnect,
    client,
    output,
    org,
    project,
    settings,
    parsedUrl
  );
}

async function addMultipleGitRemotes(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings: ProjectSettings
) {
  output.log('Found multiple Git remote URLs in Git config.');
  const remoteUrlOrOptions = await promptGitConnectMultipleUrls(
    client,
    remoteUrls
  );
  return handleOptions(
    remoteUrlOrOptions,
    client,
    output,
    org,
    project,
    settings
  );
}

async function handleOptions(
  option: string,
  client: Client,
  output: Output,
  org: Org,
  project: Project,
  settings: ProjectSettings,
  parsedUrl?: {
    provider: string;
    org: string;
    repo: string;
  }
) {
  if (option === 'no') {
    skip(output);
  } else if (option === 'opt-out') {
    await optOut(client, project, settings);
  } else if (option !== '') {
    // Option is "yes" or a URL
    if (!parsedUrl) {
      const _parsedUrl = parseRepoUrl(option);
      if (!_parsedUrl) {
        output.debug(`Could not parse repo url ${option}.`);
        return;
      }
      parsedUrl = _parsedUrl;
    }
    const { provider, org: parsedOrg, repo } = parsedUrl;
    const repoPath = `${parsedOrg}/${repo}`;

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

export async function promptGitConnectSingleUrl(
  client: Client,
  replace = false
) {
  return await list(client, {
    message: replace
      ? 'Do you want to replace it?'
      : 'Do you want to connect it to your Vercel project?',
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

async function promptGitConnectMultipleUrls(
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
