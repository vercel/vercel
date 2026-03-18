import { remove } from 'fs-extra';
import { join, basename } from 'path';
import {
  detectServices,
  LocalFileSystemDetector,
  type DetectServicesResult,
} from '@vercel/fs-detectors';
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
import {
  getServicesConfigWriteBlocker,
  type ServicesConfigWriteBlocker,
  writeServicesConfig,
} from '../projects/detect-services';
import {
  displayDetectedServices,
  displayServiceErrors,
  displayServicesConfigNote,
} from '../input/display-services';

const chalk = require('chalk');
const SERVICES_DOCS_URL = 'https://vercel.com/docs/services';
const INFERRED_SERVICES_PROMPT =
  'Multiple services were detected. What would you like to do?';

type InferredServicesChoice = 'services' | 'project-directory' | 'single-app';

export interface SetupAndLinkOptions {
  autoConfirm?: boolean;
  forceDelete?: boolean;
  link?: ProjectLinkResult;
  successEmoji?: EmojiLabel;
  setupMsg?: string;
  projectName?: string;
  /** When true, avoid prompts and return action_required payload when scope/project choice is needed */
  nonInteractive?: boolean;
  pullEnv?: boolean;
  /** When true, indicates the project is being created from v0 (grants V0Builder permissions) */
  v0?: boolean;
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
    nonInteractive = false,
    pullEnv = true,
    v0,
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

  if (!isTTY && !autoConfirm && !nonInteractive) {
    return { status: 'error', exitCode: 1, reason: 'HEADLESS' };
  }

  const shouldStartSetup =
    autoConfirm ||
    nonInteractive ||
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

  let projectOrNewProjectName: Awaited<ReturnType<typeof inputProject>>;
  try {
    projectOrNewProjectName = await inputProject(
      client,
      org,
      projectName,
      autoConfirm
    );
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'HEADLESS'
    ) {
      return { status: 'error', exitCode: 1, reason: 'HEADLESS' };
    }
    throw err;
  }

  if (typeof projectOrNewProjectName === 'string') {
    newProjectName = projectOrNewProjectName;
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
      successEmoji,
      autoConfirm,
      pullEnv
    );
    return { status: 'linked', org, project };
  }

  config.currentTeam = org.type === 'team' ? org.id : undefined;
  const rootDetectServicesResult = await detectServices({
    fs: new LocalFileSystemDetector(path),
  });
  const hasRootConfiguredServices =
    rootDetectServicesResult.resolved?.source === 'configured';
  const rootInferredServices = hasRootConfiguredServices
    ? null
    : (rootDetectServicesResult.inferred ?? null);
  const rootInferredServicesWriteBlocker = rootInferredServices
    ? await getServicesConfigWriteBlocker(path, rootInferredServices.config)
    : null;

  try {
    let settings: ProjectSettings = {};
    let pathWithRootDirectory = path;
    let rootInferredServicesChoice: InferredServicesChoice | null = null;

    if (!hasRootConfiguredServices) {
      rootInferredServicesChoice = await promptForInferredServicesSetup({
        client,
        autoConfirm,
        nonInteractive,
        workPath: path,
        inferred: rootInferredServices,
        inferredWriteBlocker: rootInferredServicesWriteBlocker,
        allowChooseDifferentProjectDirectory: true,
      });
    }

    // Setup priority:
    // 1. Explicit services config at the repo root.
    // 2. Inferred services layout at the repo root -> prompt for deployment mode.
    // 3. Standard framework setup flow.
    if (hasRootConfiguredServices) {
      if (rootDetectServicesResult.services.length > 0) {
        displayDetectedServices(rootDetectServicesResult.services);
      }
      if (rootDetectServicesResult.errors.length > 0) {
        displayServiceErrors(rootDetectServicesResult.errors);
      }
      displayServicesConfigNote();
      settings.framework = 'services';
    } else if (rootInferredServicesChoice === 'services') {
      settings.framework = 'services';
    } else {
      // Standard framework setup begins here. The selected root directory
      // gets the same priority order as the repo root:
      // configured services -> inferred services -> framework/Other.
      const skipSelectedRootInferredServicesPrompt =
        rootInferredServicesChoice === 'single-app';
      rootDirectory = await inputRootDirectory(client, path, autoConfirm);
      if (
        rootDirectory &&
        !(await validateRootDirectory(path, join(path, rootDirectory)))
      ) {
        return {
          status: 'error',
          exitCode: 1,
          reason: 'INVALID_ROOT_DIRECTORY',
        };
      }

      pathWithRootDirectory = rootDirectory ? join(path, rootDirectory) : path;
      const selectedRootDetectServicesResult =
        pathWithRootDirectory === path
          ? null
          : await detectServices({
              fs: new LocalFileSystemDetector(pathWithRootDirectory),
            });
      const hasConfiguredServicesInSelectedRoot =
        selectedRootDetectServicesResult?.resolved?.source === 'configured';
      const selectedRootInferredServices = hasConfiguredServicesInSelectedRoot
        ? null
        : (selectedRootDetectServicesResult?.inferred ?? null);
      const selectedRootInferredServicesWriteBlocker =
        selectedRootInferredServices
          ? await getServicesConfigWriteBlocker(
              pathWithRootDirectory,
              selectedRootInferredServices.config
            )
          : null;
      let localConfig = await readConfig(pathWithRootDirectory);
      if (
        localConfig instanceof CantParseJSONFile &&
        !hasConfiguredServicesInSelectedRoot
      ) {
        output.prettyError(localConfig);
        return { status: 'error', exitCode: 1 };
      }
      if (localConfig instanceof CantParseJSONFile) {
        localConfig = null;
      }

      const isZeroConfig =
        !localConfig || !localConfig.builds || localConfig.builds.length === 0;

      if (
        hasConfiguredServicesInSelectedRoot &&
        selectedRootDetectServicesResult
      ) {
        if (selectedRootDetectServicesResult.services.length > 0) {
          displayDetectedServices(selectedRootDetectServicesResult.services);
        }
        if (selectedRootDetectServicesResult.errors.length > 0) {
          displayServiceErrors(selectedRootDetectServicesResult.errors);
        }
        displayServicesConfigNote();
        settings.framework = 'services';
      } else if (
        !skipSelectedRootInferredServicesPrompt &&
        (await promptForInferredServicesSetup({
          client,
          autoConfirm,
          nonInteractive,
          workPath: pathWithRootDirectory,
          inferred: selectedRootInferredServices,
          inferredWriteBlocker: selectedRootInferredServicesWriteBlocker,
        })) === 'services'
      ) {
        settings.framework = 'services';
      } else if (isZeroConfig) {
        // Single framework preset, or "Other" if no framework is detected.
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
      v0,
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
      successEmoji,
      autoConfirm,
      false // don't prompt to pull env for newly created projects
    );

    await connectGitRepository(client, path, project, autoConfirm, org);

    return { status: 'linked', org, project };
  } catch (err) {
    if (isAPIError(err) && err.code === 'too_many_projects') {
      output.prettyError(err);
      return { status: 'error', exitCode: 1, reason: 'TOO_MANY_PROJECTS' };
    }
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'HEADLESS'
    ) {
      return { status: 'error', exitCode: 1, reason: 'HEADLESS' };
    }
    printError(err);

    return { status: 'error', exitCode: 1 };
  }
}

async function promptForInferredServicesSetup({
  client,
  autoConfirm,
  nonInteractive,
  workPath,
  inferred,
  inferredWriteBlocker,
  allowChooseDifferentProjectDirectory = false,
}: {
  client: Client;
  autoConfirm: boolean;
  nonInteractive: boolean;
  workPath: string;
  inferred: NonNullable<DetectServicesResult['inferred']> | null;
  inferredWriteBlocker: ServicesConfigWriteBlocker | null;
  allowChooseDifferentProjectDirectory?: boolean;
}): Promise<InferredServicesChoice | null> {
  if (!inferred) {
    return null;
  }

  if (inferredWriteBlocker) {
    output.warn(
      `Multiple services were detected, but your existing project config uses \`${inferredWriteBlocker}\`. To deploy multiple services in one project, see ${output.link('Services', SERVICES_DOCS_URL)}.`
    );
    return null;
  }

  displayDetectedServices(inferred.services);

  let choice: InferredServicesChoice | null = null;
  if (autoConfirm) {
    choice = 'services';
  } else if (!nonInteractive) {
    const choices: Array<{ name: string; value: InferredServicesChoice }> = [
      {
        name: 'Deploy detected services',
        value: 'services',
      },
      ...(allowChooseDifferentProjectDirectory
        ? [
            {
              name: 'Choose a different project directory',
              value: 'project-directory' as const,
            },
          ]
        : []),
      {
        name: 'Deploy a single app',
        value: 'single-app',
      },
    ];

    const selected: unknown = await client.input.select({
      message: INFERRED_SERVICES_PROMPT,
      choices,
    });
    if (
      selected === 'services' ||
      selected === 'project-directory' ||
      selected === 'single-app'
    ) {
      choice = selected;
    }
  }

  if (choice !== 'services') {
    return choice;
  }

  await writeServicesConfig(workPath, inferred.config);
  output.log('Added services configuration to vercel.json.');
  return 'services';
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
