import { Dictionary } from '@vercel/client';
import chalk from 'chalk';
import { join } from 'path';
import { Org, Project, ProjectLinkData } from '../../types';
import Client from '../../util/client';
import { parseGitConfig, pluckRemoteUrls } from '../../util/create-git-meta';
import confirm from '../../util/input/confirm';
import list, { ListChoice } from '../../util/input/list';
import { Output } from '../../util/output';
import link from '../../util/output/link';
import { getCommandName } from '../../util/pkg-name';
import {
  connectGitProvider,
  disconnectGitProvider,
  formatProvider,
  parseRepoUrl,
  printRemoteUrls,
} from '../../util/projects/connect-git-provider';
import validatePaths from '../../util/validate-paths';

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
      `Can't find \`org\` or \`project\`. Make sure your current directory is linked to a Vercel projet by running ${getCommandName(
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
    if (gitConfig) {
      return await connectArgWithLocalGit(
        client,
        output,
        org,
        project,
        confirm,
        gitConfig,
        repoArg
      );
    } else {
      return await connectArg(client, output, confirm, org, project, repoArg);
    }
  }

  if (!gitConfig) {
    output.error(
      `No local git repo found. Run ${chalk.cyan(
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
    output.log(`Found multiple remote URLs.`);
    remoteUrl = await selectRemoteUrl(client, remoteUrls);
  } else {
    // If only one is found, get it — usually "origin"
    remoteUrl = Object.values(remoteUrls)[0];
  }

  if (remoteUrl === '') {
    output.log('Aborted.');
    return 0;
  }

  output.log(`Connecting Git remote: ${link(remoteUrl)}`);

  const parsedUrl = parseRepoUrl(remoteUrl);
  if (!parsedUrl) {
    output.error(
      `Failed to parse Git repo data from the following remote URL: ${link(
        remoteUrl
      )}`
    );
    return 1;
  }
  const { provider, org: parsedOrg, repo } = parsedUrl;
  const repoPath = `${parsedOrg}/${repo}`;

  const checkAndConnect = await checkExistsAndConnect(
    client,
    output,
    confirm,
    org,
    project,
    gitProviderLink,
    provider,
    repoPath,
    parsedOrg,
    repo
  );
  if (typeof checkAndConnect === 'number') {
    return checkAndConnect;
  }

  output.log(
    `Connected ${formatProvider(provider)} repository ${chalk.cyan(repoPath)}!`
  );

  return 0;
}

async function connectArg(
  client: Client,
  output: Output,
  confirm: boolean,
  org: Org,
  project: Project,
  repoArg: string
) {
  output.log(`Connecting Git remote: ${link(repoArg)}`);
  const parsedRepoArg = parseRepoUrl(repoArg);
  if (!parsedRepoArg) {
    output.error(
      `Failed to parse URL "${repoArg}". Please ensure the URL is valid.`
    );
    return 1;
  }
  const { provider, org: parsedOrg, repo } = parsedRepoArg;
  const repoPath = `${parsedOrg}/${repo}`;
  const connect = await checkExistsAndConnect(
    client,
    output,
    confirm,
    org,
    project,
    project.link,
    provider,
    repoPath,
    parsedOrg,
    repo
  );
  if (typeof connect === 'number') {
    return connect;
  }
  output.log(
    `Connected ${formatProvider(provider)} repository ${chalk.cyan(repoPath)}!`
  );
  return 0;
}

async function connectArgWithLocalGit(
  client: Client,
  output: Output,
  org: Org,
  project: Project,
  confirm: boolean,
  gitConfig: Dictionary<any>,
  repoArg: string
) {
  const parsedUrlArg = parseRepoUrl(repoArg);
  if (!parsedUrlArg) {
    output.error(
      `Failed to parse URL "${repoArg}". Please ensure the URL is valid.`
    );
    return 1;
  }

  const remoteUrls = pluckRemoteUrls(gitConfig);
  if (remoteUrls) {
    const shouldConnect = await promptConnectArg(
      client,
      output,
      confirm,
      repoArg,
      remoteUrls
    );
    if (typeof shouldConnect === 'number') {
      return shouldConnect;
    }
    if (shouldConnect) {
      const { provider, org: parsedOrg, repo } = parsedUrlArg;
      const repoPath = `${parsedOrg}/${repo}`;
      output.log(`Connecting Git remote: ${link(repoArg)}`);
      const connect = await checkExistsAndConnect(
        client,
        output,
        confirm,
        org,
        project,
        project.link,
        provider,
        repoPath,
        parsedOrg,
        repo
      );
      if (typeof connect === 'number') {
        return connect;
      }
      output.log(
        `Connected ${formatProvider(provider)} repository ${chalk.cyan(
          repoPath
        )}!`
      );
    }
    return 0;
  }
  return await connectArg(client, output, confirm, org, project, repoArg);
}

async function promptConnectArg(
  client: Client,
  output: Output,
  yes: boolean,
  arg: string,
  remoteUrls: Dictionary<string>
) {
  const multiple = Object.keys(remoteUrls).length > 1;
  if (multiple) {
    output.log(`Found multiple Git repositories in your local Git config:`);
    printRemoteUrls(output, remoteUrls);
  } else {
    const url = Object.values(remoteUrls)[0];
    const parsedUrl = parseRepoUrl(url);
    if (!parsedUrl) {
      output.error(
        `Cannot parse URL ${url}. Make sure you didn't make any typos.`
      );
      return 1;
    }
    const parsedUrlArg = parseRepoUrl(arg);
    if (!parsedUrlArg) {
      output.error(
        `Cannot parse URL ${arg}. Make sure you didn't make any typos.`
      );
      return 1;
    }
    if (JSON.stringify(parsedUrl) === JSON.stringify(parsedUrlArg)) {
      return true;
    }

    output.log(
      `Found a repository in your local Git Config: ${chalk.cyan(
        Object.values(remoteUrls)[0]
      )}`
    );
  }

  let shouldConnect = yes;
  if (!shouldConnect) {
    shouldConnect = await confirm(
      client,
      `Do you still want to connect ${chalk.cyan(arg)}?`,
      false
    );
    if (!shouldConnect) {
      output.log(`Aborted. Repo not connected.`);
    }
  }
  return shouldConnect;
}

async function checkExistsAndConnect(
  client: Client,
  output: Output,
  confirm: boolean,
  org: Org,
  project: Project,
  gitProviderLink: ProjectLinkData | undefined,
  provider: string,
  repoPath: string,
  parsedOrg: string,
  repo: string
) {
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
      connectedOrg === parsedOrg &&
      connectedRepo === repo;
    if (isSameRepo) {
      output.log(
        `${chalk.cyan(connectedRepoPath)} is already connected to your project.`
      );
      return 1;
    }

    const shouldReplaceRepo = await confirmRepoConnect(
      client,
      output,
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
  output: Output,
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
      output.log(`Aborted. Repo not connected.`);
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
