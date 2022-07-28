import { join } from 'path';
import { parseGitConfig, pluckRemoteUrls } from '../create-git-meta';
import {
  connectGitProvider,
  formatProvider,
  parseRepoUrl,
} from '../git/connect-git-provider';
import { Output } from '../output';
import list from '../input/list';
import Client from '../client';
import { Org, Project } from '../../types';
import { getCommandName } from '../pkg-name';

export async function handleGitConnection(
  path: string,
  org: Org,
  project: Project,
  client: Client,
  output: Output
) {
  const gitConfigPath = join(path, '.git/config');
  const gitConfig = await parseGitConfig(gitConfigPath, output);

  if (gitConfig) {
    const remoteUrls = pluckRemoteUrls(gitConfig);
    if (!remoteUrls) {
      return;
    }
    if (!project.link) {
      if (Object.keys(remoteUrls).length === 1) {
        const parsedUrl = parseRepoUrl(remoteUrls[0]);
        if (parsedUrl) {
          const { provider, org: parsedOrg, repo } = parsedUrl;
          const formattedProvider = formatProvider(provider);

          output.log(
            `Found local ${formattedProvider} repository ${parsedOrg}/${repo}.`
          );
          const shouldConnect = await promptSingleUrl(client);
          if (shouldConnect === 'yes') {
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
          if (shouldConnect === 'no') {
            skip(output);
          }
          // TODO: if (shouldConnect) === 'opt-out'
        }
      } else if (Object.keys(remoteUrls).length > 1) {
        output.log('Found multiple remote URLs in Git config.');
        const url = await promptMultipleUrls(client, remoteUrls);
        if (url === 'no') {
          skip(output);
        }
        // TODO: else if (url === 'opt-out')
        else {
          // `url` is actually a remote URL now
          const parsedUrl = parseRepoUrl(url);
          if (parsedUrl) {
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
        }
      }
    } else if (project.link && Object.keys(remoteUrls).length === 1) {
      const parsedUrl = parseRepoUrl(remoteUrls[0]);
      if (!parsedUrl) return;
      const { provider, org: parsedOrg, repo } = parsedUrl;
      // project.link.repo is in the form of `org/repo`
      if (project.link.repo !== `${parsedOrg}/${repo}`) {
        output.log(
          `Found ${formatProvider(
            provider
          )} repo ${parsedOrg}/${repo}, which is different from the currently-linked ${formatProvider(
            project.link.type
          )} repo ${project.link.repo}.`
        );
        const shouldConnect = await promptSingleUrl(client, true);
        if (shouldConnect === 'yes') {
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
        if (shouldConnect === 'no') {
          skip(output);
        }
        // TODO: if (shouldConnect) === 'opt-out'
      }
    }
  }
}

function skip(output: Output) {
  output.log('Skipping...');
  output.log(
    `You can connect a Git repository in the future by running ${getCommandName(
      'git connect'
    )}.`
  );
}

async function promptSingleUrl(client: Client, replace = false) {
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

async function promptMultipleUrls(
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
  const choices = [];
  for (const url of Object.values(remoteUrls)) {
    choices.push({
      name: url,
      value: url,
      short: url,
    });
  }
  choices.push.apply(staticOptions);

  return await list(client, {
    message: 'Do you want to connect a Git repository to your Vercel project?',
    choices,
  });
}
