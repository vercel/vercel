import Client from '../client';
import { stringify } from 'qs';
import { Team } from '../../types';

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
      client.output.error(
        `Failed to connect a Git provider repo. Fetch url: ${fetchUrl}; error: ${err}`
      );
      return 1;
    });
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
