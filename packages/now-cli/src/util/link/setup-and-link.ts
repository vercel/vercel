import { join, basename } from 'path';
import chalk from 'chalk';
import { remove } from 'fs-extra';
import { NowContext, ProjectLinkResult, ProjectSettings } from '../../types';
import { NowConfig } from '../dev/types';
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
//@ts-expect-error
import createDeploy from '../deploy/create-deploy';
//@ts-expect-error
import Now from '../index';

export default async function setupAndLink(
  ctx: NowContext,
  path: string,
  forceDelete: boolean,
  autoConfirm: boolean,
  successEmoji: EmojiLabel,
  setupMsg: string
): Promise<ProjectLinkResult> {
  const {
    authConfig: { token },
    apiUrl,
    output,
    config,
  } = ctx;
  const debug = output.isDebugEnabled();
  const client = new Client({
    apiUrl,
    token,
    currentTeam: config.currentTeam,
    debug,
    output,
  });

  const isFile = !isDirectory(path);
  if (isFile) {
    output.error(`Expected directory but found file: ${path}`);
    return { status: 'error', exitCode: 1 };
  }
  const link = await getLinkedProject(output, client, path);
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
      output,
      'Which scope should contain your project?',
      client,
      config.currentTeam,
      autoConfirm
    );
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.prettyError(err);
      return { status: 'error', exitCode: 1 };
    }

    throw err;
  }

  const detectedProjectName = basename(path);

  const projectOrNewProjectName = await inputProject(
    output,
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

  let localConfig: NowConfig = {};
  if (ctx.localConfig && !(ctx.localConfig instanceof Error)) {
    localConfig = ctx.localConfig;
  }

  client.currentTeam = org.type === 'team' ? org.id : undefined;
  const isZeroConfig = !localConfig.builds || localConfig.builds.length === 0;

  try {
    let settings: ProjectSettings = {};

    if (isZeroConfig) {
      const now = new Now({
        apiUrl,
        token,
        debug,
        output,
        currentTeam: client.currentTeam,
      });
      const createArgs: any = {
        name: newProjectName,
        env: {},
        build: { env: {} },
        forceNew: undefined,
        withCache: undefined,
        quiet,
        wantsPublic: localConfig.public,
        isFile,
        type: null,
        nowConfig: localConfig,
        regions: undefined,
        meta: {},
        deployStamp: stamp(),
        target: undefined,
        skipAutoDetectionConfirmation: false,
      };

      if (!localConfig.builds || localConfig.builds.length === 0) {
        // Only add projectSettings for zero config deployments
        createArgs.projectSettings = { sourceFilesOutsideRootDirectory };
      }

      const deployment = await createDeploy(
        output,
        now,
        client.currentTeam || 'current user',
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
        if (output.isDebugEnabled()) {
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
