import Client from '../client';
import { stringify } from 'qs';
import { Org } from '../../types';
import chalk from 'chalk';
import link from '../output/link';
import { isAPIError } from '../errors-ts';
import { Output } from '../output';
import { Dictionary } from '@vercel/client';

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
  const fetchUrl = `/v9/projects/${projectId}/link?${stringify({
    teamId: org.type === 'team' ? org.id : undefined,
  })}`;
  return client.fetch(fetchUrl, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function connectGitProvider(
  client: Client,
  org: Org,
  projectId: string,
  type: string,
  repo: string
) {
  const fetchUrl = `/v9/projects/${projectId}/link?${stringify({
    teamId: org.type === 'team' ? org.id : undefined,
  })}`;
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
      client.output.error(
        `Failed to connect ${chalk.cyan(
          repo
        )} to project. Make sure there aren't any typos and that you have access to the repository if it's private.`
      );
    } else if (apiError && err.action === 'Add a Login Connection') {
      client.output.error(
        err.message.replace(repo, chalk.cyan(repo)) +
          `\nVisit ${link(err.link)} for more information.`
      );
    } else {
      client.output.error(
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

export function parseRepoUrl(originUrl: string): RepoInfo | null {
  const isSSH = originUrl.startsWith('git@');
  // Matches all characters between (// or @) and (.com or .org)
  // eslint-disable-next-line prefer-named-capture-group
  const provider =
    /(?<=(\/\/|@)).*(?=(\.com|\.org))/.exec(originUrl)?.[0] ||
    originUrl.replace('www.', '').split('.')[0];
  if (!provider) {
    return null;
  }

  let org;
  let repo;

  if (isSSH) {
    org = originUrl.split(':')[1].split('/')[0];
    repo = originUrl.split('/')[1]?.replace('.git', '');
  } else {
    // Assume https:// or git://
    org = originUrl.replace('//', '').split('/')[1];
    repo = originUrl.replace('//', '').split('/')[2]?.replace('.git', '');
  }

  if (!org || !repo) {
    return null;
  }

  return {
    url: originUrl,
    provider,
    org,
    repo,
  };
}
export function printRemoteUrls(
  output: Output,
  remoteUrls: Dictionary<string>
) {
  for (const [name, url] of Object.entries(remoteUrls)) {
    output.print(`  • ${name}: ${chalk.cyan(url)}\n`);
  }
}
