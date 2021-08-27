import { join, basename } from 'path';
import chalk from 'chalk';
import { remove } from 'fs-extra';
import { ProjectLinkResult, ProjectSettings } from '../../types';
import {
  getLinkedProject,
  linkFolderToProject,
  getVercelDirectory,
} from '../projects/link';
import createProject from '../projects/create-project';
import updateProject from '../projects/update-project';
import Client from '../client';
import handleError from '../handle-error';
import confirm from '../input/confirm';
import toHumanPath from '../humanize-path';
import { isDirectory } from '../config/global-path';
import selectOrg from '../input/select-org';
import inputProject from '../input/input-project';
import { validateRootDirectory } from '../validate-paths';
import { inputRootDirectory } from '../input/input-root-directory';
import editProjectSettings from '../input/edit-project-settings';
import stamp from '../output/stamp';
import { EmojiLabel } from '../emoji';
import createDeploy from '../deploy/create-deploy';
import Now from '../index';

export interface SetupAndLinkOptions {
  forceDelete?: boolean;
  autoConfirm?: boolean;
  successEmoji: EmojiLabel;
  setupMsg: string;
  projectName?: string;
}

export default async function setupAndLink(
  client: Client,
  path: string,
  {
    forceDelete = false,
    autoConfirm = false,
    successEmoji,
    setupMsg,
    projectName,
  }: SetupAndLinkOptions
): Promise<ProjectLinkResult> {
  const {
    authConfig: { token },
    localConfig,
    apiUrl,
    output,
    config,
  } = client;
  const debug = output.isDebugEnabled();

  const isFile = !isDirectory(path);
  if (isFile) {
    output.error(`Expected directory but found file: ${path}`);
    return { status: 'error', exitCode: 1 };
  }
  const link = await getLinkedProject(client, path);
  const isTTY = process.stdout.isTTY;
  const quiet = !isTTY;
  let rootDirectory: string | null = null;
  let sourceFilesOutsideRootDirectory = true;
  let newProjectName: string;
  let org;

  if (!forceDelete && link.status === 'linked') {
    return link;
  }

  if (forceDelete) {
    const vercelDir = getVercelDirectory(path);
    remove(vercelDir);
  }

  const shouldStartSetup =
    autoConfirm ||
    (await confirm(
      `${setupMsg} ${chalk.cyan(`“${toHumanPath(path)}”`)}?`,
      true
    ));

  if (!shouldStartSetup) {
    output.print(`Aborted. Project not set up.\n`);
    return { status: 'not_linked', org: null, project: null };
  }

  try {
    org = await selectOrg(
      client,
      'Which scope should contain your project?',
      autoConfirm
    );
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.prettyError(err);
      return { status: 'error', exitCode: 1 };
    }

    throw err;
  }

  const detectedProjectName = projectName || basename(path);

  const projectOrNewProjectName = await inputProject(
    client,
    org,
    detectedProjectName,
    autoConfirm
  );

  if (typeof projectOrNewProjectName === 'string') {
    newProjectName = projectOrNewProjectName;
    rootDirectory = await inputRootDirectory(path, output, autoConfirm);
  } else {
    const project = projectOrNewProjectName;

    await linkFolderToProject(
      output,
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

  // if we have `sourceFilesOutsideRootDirectory` set to `true`, we use the current path
  // and upload the entire directory.
  const sourcePath =
    rootDirectory && !sourceFilesOutsideRootDirectory
      ? join(path, rootDirectory)
      : path;

  if (
    rootDirectory &&
    !(await validateRootDirectory(output, path, sourcePath, ''))
  ) {
    return { status: 'error', exitCode: 1 };
  }

  config.currentTeam = org.type === 'team' ? org.id : undefined;
  const isZeroConfig =
    !localConfig || !localConfig.builds || localConfig.builds.length === 0;

  try {
    let settings: ProjectSettings = {};

    if (isZeroConfig) {
      const now = new Now({
        apiUrl,
        token,
        debug,
        output,
        currentTeam: config.currentTeam,
      });
      const createArgs: any = {
        name: newProjectName,
        env: {},
        build: { env: {} },
        forceNew: undefined,
        withCache: undefined,
        quiet,
        wantsPublic: localConfig?.public || false,
        isFile,
        type: null,
        nowConfig: localConfig,
        regions: undefined,
        meta: {},
        deployStamp: stamp(),
        target: undefined,
        skipAutoDetectionConfirmation: false,
      };

      if (isZeroConfig) {
        // Only add projectSettings for zero config deployments
        createArgs.projectSettings = { sourceFilesOutsideRootDirectory };
      }

      const deployment = await createDeploy(
        client,
        now,
        config.currentTeam || 'current user',
        [sourcePath],
        createArgs,
        org,
        !isFile,
        path
      );

      if (
        !deployment ||
        !('code' in deployment) ||
        deployment.code !== 'missing_project_settings'
      ) {
        output.error('Failed to detect project settings. Please try again.');
        if (debug) {
          console.log(deployment);
        }
        return { status: 'error', exitCode: 1 };
      }

      const { projectSettings, framework } = deployment;

      settings = await editProjectSettings(
        output,
        projectSettings,
        framework,
        autoConfirm
      );
    }

    if (rootDirectory) {
      settings.rootDirectory = rootDirectory;
    }

    const project = await createProject(client, newProjectName);
    await updateProject(client, project.id, settings);
    Object.assign(project, settings);

    await linkFolderToProject(
      output,
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
  } catch (err) {
    handleError(err);
    return { status: 'error', exitCode: 1 };
  }
}
