import chalk from 'chalk';
import { remove } from 'fs-extra';
import { join, basename } from 'path';
import type {
  ProjectLinkResult,
  ProjectSettings,
  Org,
} from '@vercel-internals/types';
import {
  getLinkedProject,
  linkFolderToProject,
  getVercelDirectory,
  VERCEL_DIR_README,
  VERCEL_DIR_PROJECT,
} from '../projects/link';
import createProject from '../projects/create-project';
import type Client from '../client';
import { printError } from '../error';
import { parseGitConfig, pluckRemoteUrls } from '../create-git-meta';
import {
  selectAndParseRemoteUrl,
  checkExistsAndConnect,
} from '../git/connect-git-provider';

import toHumanPath from '../humanize-path';
import { isDirectory } from '../config/global-path';
import selectOrg from '../input/select-org';
import inputProject from '../input/input-project';
import { validateRootDirectory } from '../validate-paths';
import { inputRootDirectory } from '../input/input-root-directory';
import {
  editProjectSettings,
  type PartialProjectSettings,
} from '../input/edit-project-settings';
import type { EmojiLabel } from '../emoji';
import { CantParseJSONFile, isAPIError } from '../errors-ts';
import output from '../../output-manager';
import { detectProjects } from '../projects/detect-projects';
import readConfig from '../config/read-config';
import { frameworkList } from '@vercel/frameworks';
import {
  vercelAuth,
  type VercelAuthSetting,
  DEFAULT_VERCEL_AUTH_SETTING,
} from '../input/vercel-auth';

export interface SetupAndLinkOptions {
  autoConfirm?: boolean;
  forceDelete?: boolean;
  link?: ProjectLinkResult;
  successEmoji?: EmojiLabel;
  setupMsg?: string;
  projectName?: string;
}

export default async function setupAndLink(
  client: Client,
  path: string,
  {
    autoConfirm = false,
    forceDelete = false,
    link,
    successEmoji = 'link',
    setupMsg = 'Set up',
    projectName = basename(path),
  }: SetupAndLinkOptions
): Promise<ProjectLinkResult> {
  const { config } = client;

  if (!isDirectory(path)) {
    output.error(`Expected directory but found file: ${path}`);
    return { status: 'error', exitCode: 1, reason: 'PATH_IS_FILE' };
  }
  if (!link) {
    link = await getLinkedProject(client, path);
  }
  const isTTY = client.stdin.isTTY;
  let rootDirectory: string | null = null;
  let newProjectName: string;
  let org;

  if (!forceDelete && link.status === 'linked') {
    return link;
  }

  if (forceDelete) {
    const vercelDir = getVercelDirectory(path);
    remove(join(vercelDir, VERCEL_DIR_README));
    remove(join(vercelDir, VERCEL_DIR_PROJECT));
  }

  if (!isTTY && !autoConfirm) {
    return { status: 'error', exitCode: 1, reason: 'HEADLESS' };
  }

  const shouldStartSetup =
    autoConfirm ||
    (await client.input.confirm(
      `${setupMsg} ${chalk.cyan(`“${toHumanPath(path)}”`)}?`,
      true
    ));

  if (!shouldStartSetup) {
    output.print(`Canceled. Project not set up.\n`);
    return { status: 'not_linked', org: null, project: null };
  }

  try {
    org = await selectOrg(
      client,
      'Which scope should contain your project?',
      autoConfirm
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.code === 'NOT_AUTHORIZED') {
        output.prettyError(err);
        return { status: 'error', exitCode: 1, reason: 'NOT_AUTHORIZED' };
      }

      if (err.code === 'TEAM_DELETED') {
        output.prettyError(err);
        return { status: 'error', exitCode: 1, reason: 'TEAM_DELETED' };
      }
    }

    throw err;
  }

  const projectOrNewProjectName = await inputProject(
    client,
    org,
    projectName,
    autoConfirm
  );

  if (typeof projectOrNewProjectName === 'string') {
    newProjectName = projectOrNewProjectName;
    rootDirectory = await inputRootDirectory(client, path, autoConfirm);
  } else {
    const project = projectOrNewProjectName;

    await linkFolderToProject(
      client,
      path,
      {
        projectId: project.id,
        orgId: org.id,
      },
      project.name,
      org.slug,
      successEmoji
    );
    return { status: 'linked', org, project };
  }

  if (
    rootDirectory &&
    !(await validateRootDirectory(path, join(path, rootDirectory)))
  ) {
    return { status: 'error', exitCode: 1, reason: 'INVALID_ROOT_DIRECTORY' };
  }

  config.currentTeam = org.type === 'team' ? org.id : undefined;

  const pathWithRootDirectory = rootDirectory
    ? join(path, rootDirectory)
    : path;
  const localConfig = await readConfig(pathWithRootDirectory);
  if (localConfig instanceof CantParseJSONFile) {
    output.prettyError(localConfig);
    return { status: 'error', exitCode: 1 };
  }

  const isZeroConfig =
    !localConfig || !localConfig.builds || localConfig.builds.length === 0;

  try {
    let settings: ProjectSettings = {};

    if (isZeroConfig) {
      const localConfigurationOverrides: PartialProjectSettings = {
        buildCommand: localConfig?.buildCommand,
        devCommand: localConfig?.devCommand,
        framework: localConfig?.framework,
        commandForIgnoringBuildStep: localConfig?.ignoreCommand,
        installCommand: localConfig?.installCommand,
        outputDirectory: localConfig?.outputDirectory,
      };

      // Run the framework detection logic against the local filesystem.
      const detectedProjectsForWorkspace = await detectProjects(
        pathWithRootDirectory
      );

      // Select the first framework detected, or use
      // the "Other" preset if none was detected.
      const detectedProjects = detectedProjectsForWorkspace.get('') || [];
      const framework =
        detectedProjects[0] ?? frameworkList.find(f => f.slug === null);

      settings = await editProjectSettings(
        client,
        {},
        framework,
        autoConfirm,
        localConfigurationOverrides
      );
    }

    // Support for changing additional, less frequently used project settings.
    let changeAdditionalSettings = false;
    if (!autoConfirm) {
      changeAdditionalSettings = await client.input.confirm(
        'Do you want to change additional project settings?',
        false
      );
    }

    let vercelAuthSetting: VercelAuthSetting = DEFAULT_VERCEL_AUTH_SETTING;
    if (changeAdditionalSettings) {
      vercelAuthSetting = await vercelAuth(client, {
        autoConfirm,
      });
    }

    if (rootDirectory) {
      settings.rootDirectory = rootDirectory;
    }

    const project = await createProject(client, {
      ...settings,
      name: newProjectName,
      vercelAuth: vercelAuthSetting,
    });

    await linkFolderToProject(
      client,
      path,
      {
        projectId: project.id,
        orgId: org.id,
      },
      project.name,
      org.slug,
      successEmoji
    );

    await connectGitRepository(client, path, project, autoConfirm, org);

    return { status: 'linked', org, project };
  } catch (err) {
    if (isAPIError(err) && err.code === 'too_many_projects') {
      output.prettyError(err);
      return { status: 'error', exitCode: 1, reason: 'TOO_MANY_PROJECTS' };
    }
    printError(err);

    return { status: 'error', exitCode: 1 };
  }
}

export async function connectGitRepository(
  client: Client,
  path: string,
  project: { id: string; link?: any },
  autoConfirm: boolean,
  org: Org
): Promise<void> {
  try {
    const gitConfig = await parseGitConfig(join(path, '.git/config'));

    if (!gitConfig) {
      return;
    }

    const remoteUrls = pluckRemoteUrls(gitConfig);
    if (!remoteUrls || Object.keys(remoteUrls).length === 0) {
      return;
    }

    const shouldConnect =
      autoConfirm ||
      (await client.input.confirm(
        `Detected a repository. Connect it to this project?`,
        true
      ));

    if (!shouldConnect) {
      return;
    }

    const repoInfo = await selectAndParseRemoteUrl(client, remoteUrls);
    if (!repoInfo) {
      return;
    }

    await checkExistsAndConnect({
      client,
      confirm: autoConfirm,
      gitProviderLink: project.link,
      org,
      gitOrg: repoInfo.org,
      project: project as any, // Type assertion since we only need the id
      provider: repoInfo.provider,
      repo: repoInfo.repo,
      repoPath: `${repoInfo.org}/${repoInfo.repo}`,
    });
  } catch (error) {
    // Silently ignore git connection errors to not disrupt the main flow
    output.debug(`Failed to connect git repository: ${error}`);
  }
}
