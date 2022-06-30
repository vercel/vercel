import Client from '../client';
import { stringify } from 'qs';
import { Team } from '../../types';
import chalk from 'chalk';

export async function disconnectGitProvider(
  client: Client,
  team: Team | null,
  projectId: string
) {
  const fetchUrl = `/v4/projects/${projectId}/link?${stringify({
    teamId: team?.id,
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
  team: Team | null,
  projectId: string,
  type: string,
  repo: string
) {
  const fetchUrl = `/v4/projects/${projectId}/link?${stringify({
    teamId: team?.id,
  })}`;
  return client
    .fetch(fetchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        repo,
      }),
    })
    .catch(err => {
      if (err.message.includes('install the GitHub integration')) {
        client.output.error(
          `Failed to link ${chalk.cyan(
            repo
          )}. Make sure there aren't any typos and that you have access to the repository if it's private.`
        );
      } else if (err.message.includes('connect github first')) {
        client.output.error(
          `Failed to link ${chalk.cyan(
            repo
          )}. You need to add a Login Connection to your Git provider first. Visit ${chalk.cyan(
            `https://vercel.com/docs/concepts/personal-accounts/login-connections`
          )} to learn how to do this.`
        );
      } else {
        client.output.error(`Failed to connect a Git provider repo.\n${err}`);
      }
      return 1;
    });
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

export function parseRepoUrl(originUrl: string): {
  provider: string;
  org: string;
  repo: string;
} | null {
  const isSSH = originUrl.startsWith('git@');
  // Matches all characters between (// or @) and (.com or .org)
  // eslint-disable-next-line prefer-named-capture-group
  const provider = /(?<=(\/\/|@)).*(?=(\.com|\.org))/.exec(originUrl);
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
    org = originUrl.split('/')[3];
    repo = originUrl.split('/')[4]?.replace('.git', '');
  }

  if (!org || !repo) {
    return null;
  }

  return {
    provider: provider[0],
    org,
    repo,
  };
}
