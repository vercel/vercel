import type { Dictionary } from '@vercel/client';
import chalk from 'chalk';
import { join } from 'path';
import type { Org, Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import { parseGitConfig, pluckRemoteUrls } from '../../util/create-git-meta';
import link from '../../util/output/link';
import { getCommandName } from '../../util/pkg-name';
import {
  type RepoInfo,
  parseRepoUrl,
  selectAndParseRemoteUrl,
  printRemoteUrls,
  checkExistsAndConnect,
} from '../../util/git/connect-git-provider';
import output from '../../output-manager';
import { GitConnectTelemetryClient } from '../../util/telemetry/commands/git/connect';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { connectSubcommand } from './command';
import { ensureLink } from '../../util/link/ensure-link';

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

export default async function connect(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(connectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const { cwd } = client;
  const telemetry = new GitConnectTelemetryClient({
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

  const confirm = Boolean(opts['--yes']);

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project connect')}`
      )}`
    );
    return 2;
  }

  const repoArg = args[0];
  telemetry.trackCliArgumentGitUrl(repoArg);

  const linkedProject = await ensureLink('git', client, client.cwd, {
    autoConfirm: confirm,
  });
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }
  const { project, org } = linkedProject;

  const gitProviderLink = project.link;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  // get project from .git
  const gitConfigPath = join(cwd, '.git/config');
  const gitConfig = await parseGitConfig(gitConfigPath);

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
      repoInfo: parsedUrlArg,
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

  const repoInfo = await selectAndParseRemoteUrl(client, remoteUrls);
  if (!repoInfo) {
    // If multiple remotes, user could have canceled (return 0)
    // If single remote, must be a parse error (return 1)
    return Object.keys(remoteUrls).length > 1 ? 0 : 1;
  }

  const result = await checkExistsAndConnect({
    client,
    confirm,
    gitProviderLink,
    org,
    gitOrg: repoInfo.org,
    project,
    provider: repoInfo.provider,
    repo: repoInfo.repo,
    repoPath: `${repoInfo.org}/${repoInfo.repo}`,
  });

  if (typeof result === 'number') {
    return result;
  }

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
  const parsedRepoArg = parseRepoUrl(repoUrl);
  if (!parsedRepoArg) {
    output.error(
      `Failed to parse URL "${repoUrl}". Please ensure the URL is valid.`
    );
    return 1;
  }
  const result = await checkExistsAndConnect({
    client,
    confirm,
    gitProviderLink: project.link,
    org,
    gitOrg: parsedRepoArg.org,
    project,
    provider: parsedRepoArg.provider,
    repo: parsedRepoArg.repo,
    repoPath: `${parsedRepoArg.org}/${parsedRepoArg.repo}`,
  });
  if (typeof result === 'number') {
    return result;
  }
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
      const result = await checkExistsAndConnect({
        client,
        confirm,
        gitProviderLink: project.link,
        org,
        gitOrg: repoInfo.org,
        project,
        provider: repoInfo.provider,
        repo: repoInfo.repo,
        repoPath: `${repoInfo.org}/${repoInfo.repo}`,
      });
      if (typeof result === 'number') {
        return result;
      }
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
    output.log('Found multiple Git repositories in your local Git config:');
    printRemoteUrls(remoteUrls);
  } else {
    const url = Object.values(remoteUrls)[0];
    const repoInfoFromGitConfig = parseRepoUrl(url);
    if (!repoInfoFromGitConfig) {
      output.error(
        `Failed to parse URL "${url}". Please ensure the URL is valid.`
      );
      return false;
    }
    if (
      JSON.stringify(repoInfoFromGitConfig) === JSON.stringify(repoInfoFromArg)
    ) {
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
    const { url: repoUrlFromArg } = repoInfoFromArg;
    shouldConnect = await client.input.confirm(
      `Do you still want to connect ${link(repoUrlFromArg)}?`,
      false
    );
    if (!shouldConnect) {
      output.log('Canceled. Repo not connected.');
    }
  }
  return shouldConnect;
}
