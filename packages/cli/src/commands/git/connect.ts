import { Dictionary } from '@vercel/client';
import chalk from 'chalk';
import { join } from 'path';
import { Org, Project, ProjectLinkData } from '../../types';
import Client from '../../util/client';
import { parseGitConfig, pluckRemoteUrls } from '../../util/create-git-meta';
import confirm from '../../util/input/confirm';
import list, { ListChoice } from '../../util/input/list';
import link from '../../util/output/link';
import { getCommandName } from '../../util/pkg-name';
import {
  connectGitProvider,
  disconnectGitProvider,
  formatProvider,
  RepoInfo,
  parseRepoUrl,
  printRemoteUrls,
} from '../../util/git/connect-git-provider';
import validatePaths from '../../util/validate-paths';

interface GitRepoCheckParams {
  client: Client;
  confirm: boolean;
  gitProviderLink?: ProjectLinkData;
  org: Org;
  gitOrg: string;
  project: Project;
  provider: string;
  repo: string;
  repoPath: string;
}

interface ConnectArgParams {
  client: Client;
  org: Org;
  project: Project;
  confirm: boolean;
  repoInfo: RepoInfo;
}

interface ConnectGitArgParams extends ConnectArgParams {
  gitConfig: Dictionary<any>;
}

interface PromptConnectArgParams {
  client: Client;
  yes: boolean;
  repoInfo: RepoInfo;
  remoteUrls: Dictionary<string>;
}

export default async function connect(
  client: Client,
  argv: any,
  args: string[],
  project: Project | undefined,
  org: Org | undefined
) {
  const { output } = client;
  const confirm = Boolean(argv['--yes']);
  const repoArg = argv._[1];

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project connect')}`
      )}`
    );
    return 2;
  }
  if (!project || !org) {
    output.error(
      `Can't find \`org\` or \`project\`. Make sure your current directory is linked to a Vercel project by running ${getCommandName(
        'link'
      )}.`
    );
    return 1;
  }

  let paths = [process.cwd()];

  const validate = await validatePaths(client, paths);
  if (!validate.valid) {
    return validate.exitCode;
  }
  const { path } = validate;

  const gitProviderLink = project.link;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  // get project from .git
  const gitConfigPath = join(path, '.git/config');
  const gitConfig = await parseGitConfig(gitConfigPath, output);

  if (repoArg) {
    // parse repo arg
    const parsedUrlArg = parseRepoUrl(repoArg);
    if (!parsedUrlArg) {
      output.error(
        `Failed to parse URL "${repoArg}". Please ensure the URL is valid.`
      );
      return 1;
    }
    if (gitConfig) {
      return await connectArgWithLocalGit({
        client,
        org,
        project,
        confirm,
        gitConfig,
        repoInfo: parsedUrlArg,
      });
    }
    return await connectArg({
      client,
      confirm,
      org,
      project,
      repoInfo: repoArg,
    });
  }

  if (!gitConfig) {
    output.error(
      `No local Git repository found. Run ${chalk.cyan(
        '`git clone <url>`'
      )} to clone a remote Git repository first.`
    );
    return 1;
  }
  const remoteUrls = pluckRemoteUrls(gitConfig);
  if (!remoteUrls) {
    output.error(
      `No remote URLs found in your Git config. Make sure you've configured a remote repo in your local Git config. Run ${chalk.cyan(
        '`git remote --help`'
      )} for more details.`
    );
    return 1;
  }

  let remoteUrl: string;

  if (Object.keys(remoteUrls).length > 1) {
    output.log('Found multiple remote URLs.');
    remoteUrl = await selectRemoteUrl(client, remoteUrls);
  } else {
    // If only one is found, get it — usually "origin"
    remoteUrl = Object.values(remoteUrls)[0];
  }

  if (remoteUrl === '') {
    output.log('Canceled');
    return 0;
  }

  output.log(`Connecting Git remote: ${link(remoteUrl)}`);

  const repoInfo = parseRepoUrl(remoteUrl);
  if (!repoInfo) {
    output.error(
      `Failed to parse Git repo data from the following remote URL: ${link(
        remoteUrl
      )}`
    );
    return 1;
  }
  const { provider, org: gitOrg, repo } = repoInfo;
  const repoPath = `${gitOrg}/${repo}`;

  const checkAndConnect = await checkExistsAndConnect({
    client,
    confirm,
    org,
    project,
    gitProviderLink,
    provider,
    repoPath,
    gitOrg,
    repo,
  });
  if (typeof checkAndConnect === 'number') {
    return checkAndConnect;
  }

  output.log(
    `Connected ${formatProvider(provider)} repository ${chalk.cyan(repoPath)}!`
  );

  return 0;
}

async function connectArg({
  client,
  confirm,
  org,
  project,
  repoInfo,
}: ConnectArgParams) {
  const { url: repoUrl } = repoInfo;
  client.output.log(`Connecting Git remote: ${link(repoUrl)}`);
  const parsedRepoArg = parseRepoUrl(repoUrl);
  if (!parsedRepoArg) {
    client.output.error(
      `Failed to parse URL "${repoUrl}". Please ensure the URL is valid.`
    );
    return 1;
  }
  const { provider, org: gitOrg, repo } = parsedRepoArg;
  const repoPath = `${gitOrg}/${repo}`;
  const connect = await checkExistsAndConnect({
    client,
    confirm,
    org,
    project,
    gitProviderLink: project.link,
    provider,
    repoPath,
    gitOrg,
    repo,
  });
  if (typeof connect === 'number') {
    return connect;
  }
  client.output.log(
    `Connected ${formatProvider(provider)} repository ${chalk.cyan(repoPath)}!`
  );
  return 0;
}

async function connectArgWithLocalGit({
  client,
  org,
  project,
  confirm,
  gitConfig,
  repoInfo,
}: ConnectGitArgParams) {
  const remoteUrls = pluckRemoteUrls(gitConfig);
  if (remoteUrls) {
    const shouldConnect = await promptConnectArg({
      client,
      yes: confirm,
      repoInfo,
      remoteUrls,
    });
    if (!shouldConnect) {
      return 1;
    }
    if (shouldConnect) {
      const { provider, org: gitOrg, repo, url: repoUrl } = repoInfo;
      const repoPath = `${gitOrg}/${repo}`;
      client.output.log(`Connecting Git remote: ${link(repoUrl)}`);
      const connect = await checkExistsAndConnect({
        client,
        confirm,
        org,
        project,
        gitProviderLink: project.link,
        provider,
        repoPath,
        gitOrg,
        repo,
      });
      if (typeof connect === 'number') {
        return connect;
      }
      client.output.log(
        `Connected ${formatProvider(provider)} repository ${chalk.cyan(
          repoPath
        )}!`
      );
    }
    return 0;
  }
  return await connectArg({ client, confirm, org, project, repoInfo });
}

async function promptConnectArg({
  client,
  yes,
  repoInfo: repoInfoFromArg,
  remoteUrls,
}: PromptConnectArgParams) {
  if (Object.keys(remoteUrls).length > 1) {
    client.output.log(
      'Found multiple Git repositories in your local Git config:'
    );
    printRemoteUrls(client.output, remoteUrls);
  } else {
    const url = Object.values(remoteUrls)[0];
    const repoInfoFromGitConfig = parseRepoUrl(url);
    if (!repoInfoFromGitConfig) {
      client.output.error(
        `Failed to parse URL "${url}". Please ensure the URL is valid.`
      );
      return false;
    }
    if (
      JSON.stringify(repoInfoFromGitConfig) === JSON.stringify(repoInfoFromArg)
    ) {
      return true;
    }

    client.output.log(
      `Found a repository in your local Git Config: ${chalk.cyan(
        Object.values(remoteUrls)[0]
      )}`
    );
  }

  let shouldConnect = yes;
  if (!shouldConnect) {
    const { url: repoUrlFromArg } = repoInfoFromArg;
    shouldConnect = await confirm(
      client,
      `Do you still want to connect ${link(repoUrlFromArg)}?`,
      false
    );
    if (!shouldConnect) {
      client.output.log('Canceled. Repo not connected.');
    }
  }
  return shouldConnect;
}

async function checkExistsAndConnect({
  client,
  confirm,
  org,
  project,
  gitProviderLink,
  provider,
  repoPath,
  gitOrg,
  repo,
}: GitRepoCheckParams) {
  if (!gitProviderLink) {
    const connect = await connectGitProvider(
      client,
      org,
      project.id,
      provider,
      repoPath
    );
    if (typeof connect === 'number') {
      return connect;
    }
  } else {
    const connectedProvider = gitProviderLink.type;
    const connectedOrg = gitProviderLink.org;
    const connectedRepo = gitProviderLink.repo;
    const connectedRepoPath = `${connectedOrg}/${connectedRepo}`;

    const isSameRepo =
      connectedProvider === provider &&
      connectedOrg === gitOrg &&
      connectedRepo === repo;
    if (isSameRepo) {
      client.output.log(
        `${chalk.cyan(connectedRepoPath)} is already connected to your project.`
      );
      return 1;
    }

    const shouldReplaceRepo = await confirmRepoConnect(
      client,
      confirm,
      connectedProvider,
      connectedRepoPath
    );
    if (!shouldReplaceRepo) {
      return 0;
    }

    await disconnectGitProvider(client, org, project.id);
    const connect = await connectGitProvider(
      client,
      org,
      project.id,
      provider,
      repoPath
    );
    if (typeof connect === 'number') {
      return connect;
    }
  }
}

async function confirmRepoConnect(
  client: Client,
  yes: boolean,
  connectedProvider: string,
  connectedRepoPath: string
) {
  let shouldReplaceProject = yes;
  if (!shouldReplaceProject) {
    shouldReplaceProject = await confirm(
      client,
      `Looks like you already have a ${formatProvider(
        connectedProvider
      )} repository connected: ${chalk.cyan(
        connectedRepoPath
      )}. Do you want to replace it?`,
      true
    );
    if (!shouldReplaceProject) {
      client.output.log('Canceled. Repo not connected.');
    }
  }
  return shouldReplaceProject;
}

async function selectRemoteUrl(
  client: Client,
  remoteUrls: Dictionary<string>
): Promise<string> {
  let choices: ListChoice[] = [];
  for (const [urlKey, urlValue] of Object.entries(remoteUrls)) {
    choices.push({
      name: `${urlValue} ${chalk.gray(`(${urlKey})`)}`,
      value: urlValue,
      short: urlKey,
    });
  }

  return await list(client, {
    message: 'Which remote do you want to connect?',
    choices,
  });
}
