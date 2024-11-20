import { URL } from 'url';
import Client from '../client';
import chalk from 'chalk';
import link from '../output/link';
import { isAPIError } from '../errors-ts';
import { Dictionary } from '@vercel/client';
import type { Org } from '@vercel-internals/types';
import output from '../../output-manager';

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
  if (pathParts.length !== 2) return null;
  const org = pathParts[0];
  const repo = pathParts[1].replace(/\.git$/, '');
  return { url: originUrl, provider, org, repo };
}

export function printRemoteUrls(remoteUrls: Dictionary<string>) {
  for (const [name, url] of Object.entries(remoteUrls)) {
    output.print(`  • ${name}: ${chalk.cyan(url)}\n`);
  }
}
