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

async function addSingleGitRemote(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: { [key: string]: string },
  settings: ProjectSettings
) {
  const newRemoteUrl = Object.values(remoteUrls)[0];

  const parsedNewRemoteUrl = parseRepoUrl(newRemoteUrl);
  if (!parsedNewRemoteUrl) {
    output.debug(`Could not parse repo url ${newRemoteUrl}.`);
    return;
  }
  const { org: parsedOrg, repo, provider } = parsedNewRemoteUrl;
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
    const currentRemote = `${project.link?.org}/${project.link?.repo}`;
    const currentProvider = project.link?.type;
    output.log(
      `Found Git remote url ${newRemoteUrl}, which is different from the connected ${formatProvider(
        currentProvider || ''
      )} repository ${currentRemote}.`
    );
  } else {
    output.log(`Found local Git remote URL ${newRemoteUrl}.`);
  }
  const shouldConnect = await promptGitConnectSingleUrl(client, replace);
  await parseOptions(
    shouldConnect,
    client,
    output,
    org,
    project,
    provider,
    repo,
    parsedOrg,
    settings
  );
}

async function addMultipleGitRemotes(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: { [key: string]: string },
  settings: ProjectSettings
) {
  output.log('Found multiple Git remote URLs in Git config.');
  const remoteUrl = await promptGitConnectMultipleUrls(client, remoteUrls);
  if (remoteUrl === 'no' || remoteUrl === 'opt-out') {
    return await parseOptions(
      remoteUrl,
      client,
      output,
      org,
      project,
      '',
      '',
      '',
      settings
    );
  }

  // remoteUrl is now guaranteed to be a URL.
  const parsedUrl = parseRepoUrl(remoteUrl);
  if (!parsedUrl) {
    output.debug(`Could not parse repo url ${remoteUrl}.`);
    return;
  }
  const { provider, org: parsedOrg, repo } = parsedUrl;

  const connect = await connectGitProvider(
    client,
    org,
    project.id,
    provider,
    repo
  );
  if (connect !== 1) {
    output.log(`Connected ${parsedOrg}/${repo}!`);
  }
}

export async function handleGitConnection(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: { [key: string]: string },
  settings?: ProjectSettings
) {
  if (!settings) {
    settings = getProjectSettings(project);
  }
  if (Object.keys(remoteUrls).length === 1) {
    await addSingleGitRemote(
      client,
      org,
      output,
      project,
      remoteUrls,
      settings
    );
  } else if (Object.keys(remoteUrls).length > 1 && !project.link) {
    await addMultipleGitRemotes(
      client,
      org,
      output,
      project,
      remoteUrls,
      settings
    );
  }
}

function getProjectSettings(project: Project): ProjectSettings {
  return {
    createdAt: project.createdAt,
    framework: project.framework,
    devCommand: project.devCommand,
    installCommand: project.installCommand,
    buildCommand: project.buildCommand,
    outputDirectory: project.outputDirectory,
    rootDirectory: project.rootDirectory,
    directoryListing: project.directoryListing,
    nodeVersion: project.nodeVersion,
    noGitPrompt: project.noGitPrompt,
  };
}

async function parseOptions(
  option: string,
  client: Client,
  output: Output,
  org: Org,
  project: Project,
  provider: string,
  repo: string,
  parsedOrg: string,
  settings: ProjectSettings
) {
  if (option === 'yes') {
    if (project.link) {
      await disconnectGitProvider(client, org, project.id);
    }
    const connect = await connectGitProvider(
      client,
      org,
      project.id,
      provider,
      repo
    );
    if (connect !== 1) {
      output.log(`Connected ${parsedOrg}/${repo}!`);
    }
  } else if (option === 'no') {
    skip(output);
  } else if (option === 'opt-out') {
    await optOut(client, project, settings);
  }
}

async function optOut(
  client: Client,
  project: Project,
  settings: ProjectSettings
) {
  settings.noGitPrompt = true;
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
        short: 'opt-out',
      },
    ],
  });
}

export async function promptGitConnectMultipleUrls(
  client: Client,
  remoteUrls: { [key: string]: string }
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
      short: 'opt-out',
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
