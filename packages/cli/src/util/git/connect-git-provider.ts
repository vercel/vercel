import { URL } from 'url';
import type Client from '../client';
import chalk from 'chalk';
import link from '../output/link';
import { isAPIError } from '../errors-ts';
import type { Dictionary } from '@vercel/client';
import type { Org, Project, ProjectLinkData } from '@vercel-internals/types';
import output from '../../output-manager';
import list, { type ListChoice } from '../input/list';

export interface RepoInfo {
  url: string;
  provider: string;
  org: string;
  repo: string;
}

export async function disconnectGitProvider(
  client: Client,
  org: Org,
  projectId: string
) {
  const fetchUrl = `/v9/projects/${projectId}/link`;
  return client.fetch(fetchUrl, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function connectGitProvider(
  client: Client,
  projectId: string,
  type: string,
  repo: string
) {
  const fetchUrl = `/v9/projects/${projectId}/link`;
  try {
    return await client.fetch(fetchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        repo,
      }),
    });
  } catch (err: unknown) {
    const apiError = isAPIError(err);
    if (
      apiError &&
      (err.action === 'Install GitHub App' || err.code === 'repo_not_found')
    ) {
      output.error(
        `Failed to connect ${chalk.cyan(
          repo
        )} to project. Make sure there aren't any typos and that you have access to the repository if it's private.`
      );
    } else if (apiError && err.action === 'Add a Login Connection') {
      output.error(
        err.message.replace(repo, chalk.cyan(repo)) +
          `\nVisit ${link(err.link)} for more information.`
      );
    } else {
      output.error(
        `Failed to connect the ${formatProvider(
          type
        )} repository ${repo}.\n${err}`
      );
    }
    return 1;
  }
}

export function formatProvider(type: string): string {
  switch (type) {
    case 'github':
      return 'GitHub';
    case 'gitlab':
      return 'GitLab';
    case 'bitbucket':
      return 'Bitbucket';
    default:
      return type;
  }
}

export function buildRepoUrl(
  provider: string,
  org: string,
  repo: string
): string | null {
  switch (provider) {
    case 'github':
      return `https://github.com/${org}/${repo}`;
    case 'gitlab':
      return `https://gitlab.com/${org}/${repo}`;
    case 'bitbucket':
      return `https://bitbucket.org/${org}/${repo}`;
    default:
      // For unknown providers, return null to indicate we should use repo path
      return null;
  }
}

function getURL(input: string) {
  let url: URL | null = null;

  try {
    url = new URL(input);
  } catch {}

  if (!url) {
    // Probably an SSH url, so mangle it into a
    // format that the URL constructor works with.
    try {
      url = new URL(`ssh://${input.replace(':', '/')}`);
    } catch {}
  }

  return url;
}

export function parseRepoUrl(originUrl: string): RepoInfo | null {
  const url = getURL(originUrl);
  if (!url) return null;

  const hostParts = url.hostname.split('.');
  if (hostParts.length < 2) return null;
  const provider = hostParts[hostParts.length - 2];

  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) return null;
  const repo = pathParts.pop()?.replace(/\.git$/, '');
  if (!repo) return null;
  const org = pathParts.join('/');
  return { url: originUrl, provider, org, repo };
}

export function printRemoteUrls(remoteUrls: Dictionary<string>) {
  for (const [name, url] of Object.entries(remoteUrls)) {
    output.print(`  • ${name}: ${chalk.cyan(url)}\n`);
  }
}

export async function selectRemoteUrl(
  client: Client,
  remoteUrls: Dictionary<string>
): Promise<string> {
  const choices: ListChoice[] = [];
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

export async function selectAndParseRemoteUrl(
  client: Client,
  remoteUrls: Dictionary<string>
): Promise<RepoInfo | null> {
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
    return null;
  }

  const repoInfo = parseRepoUrl(remoteUrl);
  if (!repoInfo) {
    output.log(`Connecting Git repository: ${chalk.cyan(remoteUrl)}`);
    output.error(
      `Failed to parse Git repo data from the following remote URL: ${link(
        remoteUrl
      )}`
    );
    return null;
  }

  return repoInfo;
}

export interface GitRepoCheckParams {
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

export async function checkExistsAndConnect({
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
  const displayUrl = buildRepoUrl(provider, gitOrg, repo) || repoPath;
  output.log(
    `Connecting ${formatProvider(provider)} repository: ${chalk.cyan(displayUrl)}`
  );

  if (!gitProviderLink) {
    const connect = await connectGitProvider(
      client,
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
      output.log(
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
      project.id,
      provider,
      repoPath
    );
    if (typeof connect === 'number') {
      return connect;
    }
  }

  output.log('Connected');
}

async function confirmRepoConnect(
  client: Client,
  yes: boolean,
  connectedProvider: string,
  connectedRepoPath: string
) {
  let shouldReplaceProject = yes;
  if (!shouldReplaceProject) {
    shouldReplaceProject = await client.input.confirm(
      `Looks like you already have a ${formatProvider(
        connectedProvider
      )} repository connected: ${chalk.cyan(
        connectedRepoPath
      )}. Do you want to replace it?`,
      true
    );
    if (!shouldReplaceProject) {
      output.log('Canceled. Repo not connected.');
    }
  }
  return shouldReplaceProject;
}
