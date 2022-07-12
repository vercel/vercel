import chalk from 'chalk';
import { join } from 'path';
import { Org, Project } from '../../types';
import Client from '../../util/client';
import { parseGitConfig, pluckRemoteUrl } from '../../util/create-git-meta';
import confirm from '../../util/input/confirm';
import { Output } from '../../util/output';
import link from '../../util/output/link';
import { getCommandName } from '../../util/pkg-name';
import {
  connectGitProvider,
  disconnectGitProvider,
  formatProvider,
  parseRepoUrl,
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
  const confirm = Boolean(argv['--confirm']);

  if (args.length !== 0) {
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
  if (!gitConfig) {
    output.error(
      `No local git repo found. Run ${chalk.cyan(
        '`git clone <url>`'
      )} to clone a remote Git repository first.`
    );
    return 1;
  }
  const remoteUrl = pluckRemoteUrl(gitConfig);
  if (!remoteUrl) {
    output.error(
      `No remote origin URL found in your Git config. Make sure you've configured a remote repo in your local Git config. Run ${chalk.cyan(
        '`git remote --help`'
      )} for more details.`
    );
    return 1;
  }
  output.log(`Identified Git remote "origin": ${link(remoteUrl)}`);
  const parsedUrl = parseRepoUrl(remoteUrl);
  if (!parsedUrl) {
    output.error(
      `Failed to parse Git repo data from the following remote URL in your Git config: ${link(
        remoteUrl
      )}`
    );
    return 1;
  }
  const { provider, org: gitOrg, repo } = parsedUrl;
  const repoPath = `${gitOrg}/${repo}`;
  let connectedRepoPath;

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
    connectedRepoPath = `${connectedOrg}/${connectedRepo}`;

    const isSameRepo =
      connectedProvider === provider &&
      connectedOrg === gitOrg &&
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

  output.log(
    `Connected ${formatProvider(provider)} repository ${chalk.cyan(repoPath)}!`
  );

  return 0;
}

async function confirmRepoConnect(
  client: Client,
  output: Output,
  yes: boolean,
  connectedRepoPath: string
) {
  let shouldReplaceProject = yes;
  if (!shouldReplaceProject) {
    shouldReplaceProject = await confirm(
      client,
      `Looks like you already have a repository connected: ${chalk.cyan(
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
