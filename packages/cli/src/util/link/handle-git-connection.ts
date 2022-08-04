import { Dictionary } from '@vercel/client';
import { parseRepoUrl } from '../git/connect-git-provider';
import { Output } from '../output';
import Client from '../client';
import { Org, Project, ProjectSettings } from '../../types';
import { handleOptions } from './handle-options';
import {
  promptGitConnectMultipleUrls,
  promptGitConnectSingleUrl,
} from './git-connect-prompts';

export async function handleGitConnection(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings?: ProjectSettings
): Promise<number | void> {
  if (Object.keys(remoteUrls).length === 1) {
    return addSingleGitRemote(
      client,
      org,
      output,
      project,
      remoteUrls,
      settings || project
    );
  } else if (Object.keys(remoteUrls).length > 1 && !project.link) {
    return addMultipleGitRemotes(
      client,
      org,
      output,
      project,
      remoteUrls,
      settings || project
    );
  }
}

async function addSingleGitRemote(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings: ProjectSettings
) {
  const remoteUrl = Object.values(remoteUrls)[0];
  const parsedUrl = parseRepoUrl(remoteUrl);
  if (!parsedUrl) {
    output.debug(`Could not parse repo url ${parsedUrl}.`);
    return 1;
  }
  const { org: parsedOrg, repo, provider } = parsedUrl;
  const alreadyLinked =
    project.link?.org === parsedOrg &&
    project.link.repo === repo &&
    project.link.type === provider;
  if (alreadyLinked) {
    output.debug('Project already linked. Skipping...');
    return;
  }

  const replace =
    project.link &&
    (project.link.org !== parsedOrg ||
      project.link.repo !== repo ||
      project.link.type !== provider);
  const shouldConnect = await promptGitConnectSingleUrl(
    client,
    output,
    project,
    remoteUrl,
    replace
  );
  return handleOptions(
    shouldConnect,
    client,
    output,
    org,
    project,
    settings,
    parsedUrl
  );
}

async function addMultipleGitRemotes(
  client: Client,
  org: Org,
  output: Output,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings: ProjectSettings
) {
  output.log('Found multiple Git remote URLs in Git config.');
  const remoteUrlOrOptions = await promptGitConnectMultipleUrls(
    client,
    remoteUrls
  );
  return handleOptions(
    remoteUrlOrOptions,
    client,
    output,
    org,
    project,
    settings
  );
}
