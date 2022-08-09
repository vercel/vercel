import { Dictionary } from '@vercel/client';
import { parseRepoUrl } from '../git/connect-git-provider';
import Client from '../client';
import { Org, Project, ProjectSettings } from '../../types';
import { handleOptions } from './handle-options';
import {
  promptGitConnectMultipleUrls,
  promptGitConnectSingleUrl,
} from './git-connect-prompts';

function getProjectSettings(project: Project): ProjectSettings {
  return {
    createdAt: project.createdAt,
    framework: project.framework,
    devCommand: project.devCommand,
    installCommand: project.installCommand,
    buildCommand: project.buildCommand,
    outputDirectory: project.outputDirectory,
    rootDirectory: project.rootDirectory,
    directoryListing: project.directoryListing,
    nodeVersion: project.nodeVersion,
    skipGitConnectDuringLink: project.skipGitConnectDuringLink,
  };
}

export async function addGitConnection(
  client: Client,
  org: Org,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings?: ProjectSettings
): Promise<number | void> {
  if (!settings) {
    settings = getProjectSettings(project);
  }
  if (Object.keys(remoteUrls).length === 1) {
    return addSingleGitRemote(
      client,
      org,
      project,
      remoteUrls,
      settings || project
    );
  } else if (Object.keys(remoteUrls).length > 1 && !project.link) {
    return addMultipleGitRemotes(
      client,
      org,
      project,
      remoteUrls,
      settings || project
    );
  }
}

async function addSingleGitRemote(
  client: Client,
  org: Org,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings: ProjectSettings
) {
  const [remoteName, remoteUrl] = Object.entries(remoteUrls)[0];
  const repoInfo = parseRepoUrl(remoteUrl);
  if (!repoInfo) {
    client.output.debug(`Could not parse repo url ${repoInfo}.`);
    return 1;
  }
  const { org: parsedOrg, repo, provider } = repoInfo;
  const alreadyLinked =
    project.link?.org === parsedOrg &&
    project.link.repo === repo &&
    project.link.type === provider;
  if (alreadyLinked) {
    client.output.debug('Project already linked. Skipping...');
    return;
  }

  const replace =
    project.link &&
    (project.link.org !== parsedOrg ||
      project.link.repo !== repo ||
      project.link.type !== provider);
  const shouldConnect = await promptGitConnectSingleUrl(
    client,
    project,
    remoteName,
    remoteUrl,
    replace
  );
  return handleOptions(shouldConnect, client, org, project, settings, repoInfo);
}

async function addMultipleGitRemotes(
  client: Client,
  org: Org,
  project: Project,
  remoteUrls: Dictionary<string>,
  settings: ProjectSettings
) {
  client.output.log('Found multiple Git remote URLs in Git config.');
  const remoteUrlOrOptions = await promptGitConnectMultipleUrls(
    client,
    remoteUrls
  );
  return handleOptions(remoteUrlOrOptions, client, org, project, settings);
}
