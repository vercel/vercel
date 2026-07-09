import { remove } from 'fs-extra';
import { join, basename } from 'path';
import { getPlatformEnv } from '@vercel/build-utils';
import { LocalFileSystemDetector, getWorkspaces } from '@vercel/fs-detectors';
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
import { linkRepoProject } from './repo';
import createProject from '../projects/create-project';
import type Client from '../client';
import { printError } from '../error';
import pull from '../../commands/env/pull';
import { parseGitConfig, pluckRemoteUrls } from '../create-git-meta';
import {
  selectAndParseRemoteUrl,
  checkExistsAndConnect,
} from '../git/connect-git-provider';

import toHumanPath from '../humanize-path';
import { isDirectory } from '../fs';
import selectOrg from '../input/select-org';
import inputProject, { BACK_TO_TEAM_SELECTION } from '../input/input-project';
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
import { findSourceVercelConfigFile } from '../compile-vercel-config';
import { frameworkList } from '@vercel/frameworks';
import {
  vercelAuth,
  type VercelAuthSetting,
  DEFAULT_VERCEL_AUTH_SETTING,
} from '../input/vercel-auth';
import { printAlignedLabel } from '../output/print-aligned-label';
import {
  displayConfiguredServicesSetup,
  getServicesSetupState,
  promptForInferredServicesSetup,
  toProjectRootDirectory,
  type InferredServicesChoice,
} from './services-setup';
import { searchProjectsByRepoRoot } from '../projects/search-project-across-teams';
import type { CrossTeamMatch } from '../projects/search-project-across-teams';
import { isPromptCanceledError } from '../input/prompt-cancellation';

export interface SetupAndLinkOptions {
  autoConfirm?: boolean;
  forceDelete?: boolean;
  link?: ProjectLinkResult;
  /** Team selected by the caller before project discovery. */
  selectedOrg?: Org;
  successEmoji?: EmojiLabel;
  projectName?: string;
  /** When true, avoid prompts and return action_required payload when scope/project choice is needed */
  nonInteractive?: boolean;
  pullEnv?: boolean;
  /** When true, indicates the project is being created from v0 (grants V0Builder permissions) */
  v0?: boolean;
  /**
   * When true with an explicit `projectName`, bail out instead of running
   * `setupAndLink`. Use for user-supplied `--project <NAME_OR_ID>` so typos
   * fail fast rather than creating a new project.
   */
  failIfNotFound?: boolean;
}

function isCrossTeamMatch(value: unknown): value is CrossTeamMatch {
  return (
    typeof value === 'object' &&
    value !== null &&
    'project' in value &&
    'org' in value &&
    'reason' in value
  );
}

/**
 * Resolves the team via `selectOrg`, mapping known API errors to link error
 * results. Returns an `Org` on success, or a `ProjectLinkResult` error.
 */
async function selectOrgForLink(
  client: Client,
  autoConfirm: boolean,
  searchable = false,
  meta?: { choiceCount?: number }
): Promise<Org | ProjectLinkResult> {
  try {
    return await selectOrg(
      client,
      'Which team?',
      autoConfirm,
      searchable,
      meta
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
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return (
    err instanceof Error && typeof (err as { code?: unknown }).code === 'string'
  );
}

// Detect whether `cwd` is a workspace root (monorepo with multiple packages).
// If the filesystem can't be read (ENOENT/EACCES/ENOTDIR), treat it as a
// single-app project rather than crashing the CLI.
async function hasWorkspaces(cwd: string): Promise<boolean> {
  try {
    const fs = new LocalFileSystemDetector(cwd);
    const workspaces = await getWorkspaces({ fs });
    return workspaces.length > 0;
  } catch (err) {
    if (
      isErrnoException(err) &&
      err.code &&
      ['ENOENT', 'EACCES', 'ENOTDIR'].includes(err.code)
    ) {
      output.debug(`getWorkspaces failed for ${cwd}: ${err}`);
      return false;
    }
    throw err;
  }
}

/**
 * Decides whether to prompt the user for a project root directory.
 *
 * Returns true if any of:
 *  - the user explicitly chose "Choose a different root directory" via the
 *    inferred-services picker
 *  - the directory is a workspace (monorepo with multiple packages)
 *  - framework detection at the root finds nothing — covers nested-monolith
 *    layouts like `repo/app/package.json` where the app lives in a subdir
 *
 * Returns false only for single-app projects with a framework detected at
 * the root — that's the fast-path the no-prompt optimization targets.
 */
export async function shouldPromptForRootDirectory(opts: {
  path: string;
  servicesChoice: InferredServicesChoice | null;
}): Promise<boolean> {
  if (opts.servicesChoice?.type === 'project-directory') {
    return true;
  }
  if (await hasWorkspaces(opts.path)) {
    return true;
  }
  try {
    const detected = await detectProjects(opts.path);
    const frameworksAtRoot = detected.get('') ?? [];
    return frameworksAtRoot.length === 0;
  } catch (err) {
    output.debug(`detectProjects failed at root: ${err}`);
    // Safer to prompt than to silently misconfigure.
    return true;
  }
}

async function maybePullEnvAfterLink(
  client: Client,
  path: string,
  autoConfirm: boolean,
  pullEnv: boolean
): Promise<void> {
  if (!pullEnv || !client.stdin.isTTY || client.nonInteractive) {
    return;
  }

  output.print('\n');

  const pullEnvConfirmed =
    autoConfirm ||
    (await client.input.confirm(
      'Pull development environment variables into .env.local?',
      true
    ));

  if (!pullEnvConfirmed) {
    return;
  }

  const originalCwd = client.cwd;
  try {
    client.cwd = path;
    const args = autoConfirm ? ['--yes'] : [];
    const exitCode = await pull(client, args, 'vercel-cli:link');

    if (exitCode !== 0) {
      output.error(
        'Failed to pull environment variables. You can run `vc env pull` manually.'
      );
    }
  } catch (_error) {
    output.error(
      'Failed to pull environment variables. You can run `vc env pull` manually.'
    );
  } finally {
    client.cwd = originalCwd;
  }
}

async function linkCrossTeamMatch({
  client,
  path,
  match,
  successEmoji,
  autoConfirm,
  pullEnv,
}: {
  client: Client;
  path: string;
  match: CrossTeamMatch;
  successEmoji: EmojiLabel;
  autoConfirm: boolean;
  pullEnv: boolean;
}): Promise<ProjectLinkResult> {
  client.config.currentTeam =
    match.org.type === 'team' ? match.org.id : undefined;

  if (match.reason === 'repo-root' && match.repo) {
    await linkRepoProject(client, path, {
      project: match.project,
      orgId: match.org.id,
      orgSlug: match.org.slug,
      remoteName: match.repo.remoteName,
      successEmoji,
    });
    await maybePullEnvAfterLink(client, path, autoConfirm, pullEnv);
    return {
      status: 'linked',
      org: match.org,
      project: match.project,
      repoRoot: match.repo.rootPath,
    };
  }

  await linkFolderToProject(
    client,
    path,
    { projectId: match.project.id, orgId: match.org.id },
    match.project.name,
    match.org.slug,
    successEmoji,
    autoConfirm,
    pullEnv
  );
  return { status: 'linked', org: match.org, project: match.project };
}

export default async function setupAndLink(
  client: Client,
  path: string,
  {
    autoConfirm = false,
    forceDelete = false,
    link,
    selectedOrg,
    successEmoji = 'link',
    projectName,
    nonInteractive = false,
    pullEnv = true,
    v0,
  }: SetupAndLinkOptions
): Promise<ProjectLinkResult> {
  const { config } = client;
  const gitProjectName = projectName;
  projectName = projectName ?? basename(path);

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
  let org = selectedOrg;

  if (!forceDelete && link.status === 'linked') {
    return link;
  }

  // `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` form an explicit project-owner
  // pair, so resolve and confirm exactly that pair without prompting (and
  // without requiring `--yes`). The env link itself is what makes commands
  // work here, so leave local link files untouched.
  if (getPlatformEnv('ORG_ID') && getPlatformEnv('PROJECT_ID')) {
    const envLink = await getLinkedProject(client, path);
    if (envLink.status === 'error') {
      return envLink;
    }
    if (envLink.status === 'linked') {
      config.currentTeam =
        envLink.org.type === 'team' ? envLink.org.id : undefined;
      output.print('\n');
      printAlignedLabel('Directory', toHumanPath(path));
      printAlignedLabel('Source', 'VERCEL_ORG_ID and VERCEL_PROJECT_ID');
      output.print('\n');
      printAlignedLabel(
        'Linked',
        `${envLink.org.slug}/${envLink.project.name}`,
        { gutter: '✓' }
      );
      return envLink;
    }
  }

  if (!isTTY && !autoConfirm && !nonInteractive) {
    return { status: 'error', exitCode: 1, reason: 'HEADLESS' };
  }

  // Without a TTY the team must come from an explicit signal (`--scope`,
  // `--team`, `vercel.json` `scope`, `VERCEL_ORG_ID`) or be the only choice.
  // Resolve it before deleting the existing link and before any project
  // discovery, so a missing scope fails fast without breaking local state.
  if (!org && (nonInteractive || !isTTY)) {
    const resolved = await selectOrgForLink(client, autoConfirm);
    if ('status' in resolved) {
      return resolved;
    }
    org = resolved;
  }

  if (forceDelete) {
    const vercelDir = getVercelDirectory(path);
    remove(join(vercelDir, VERCEL_DIR_README));
    remove(join(vercelDir, VERCEL_DIR_PROJECT));
  }

  // The command invocation carries setup intent; show the local target as state.
  output.print('\n');
  printAlignedLabel('Directory', toHumanPath(path));
  output.print('\n');

  // Every command that establishes a link gets the same interactive flow:
  // searchable team picker, then Git/folder project suggestions scoped to
  // the chosen team. An explicit project name skips the suggestions and is
  // resolved directly.
  const interactive = isTTY && !nonInteractive;
  const searchableTeamPicker = interactive;
  const showProjectSuggestions = interactive && !gitProjectName;

  let projectOrNewProjectName: Awaited<ReturnType<typeof inputProject>>;
  // When the team was auto-selected as the only choice, there is no other
  // team to go back to, so the project picker hides that option.
  let teamAutoSelected = false;
  for (;;) {
    if (!org) {
      const orgMeta: { choiceCount?: number } = {};
      const resolved = await selectOrgForLink(
        client,
        autoConfirm,
        searchableTeamPicker,
        orgMeta
      );
      if ('status' in resolved) {
        return resolved;
      }
      org = resolved;
      teamAutoSelected = orgMeta.choiceCount === 1;
    }

    let repoMatches: CrossTeamMatch[] = [];
    if (showProjectSuggestions) {
      output.spinner('Searching for existing projects…', 1000);
      try {
        repoMatches = await searchProjectsByRepoRoot({
          client,
          cwd: path,
          gitProjectName,
          orgs: [org],
          autoConfirm,
          nonInteractive,
        });
      } catch (err) {
        if (isPromptCanceledError(err)) {
          throw err;
        }
        output.debug(`Git-linked project search failed: ${err}`);
      } finally {
        output.stopSpinner();
      }
    }

    try {
      projectOrNewProjectName = await inputProject(
        client,
        org,
        projectName,
        autoConfirm,
        false,
        showProjectSuggestions,
        searchableTeamPicker && !selectedOrg && !teamAutoSelected,
        repoMatches
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

    if (projectOrNewProjectName === BACK_TO_TEAM_SELECTION) {
      org = undefined;
      continue;
    }
    break;
  }

  if (typeof projectOrNewProjectName === 'string') {
    newProjectName = projectOrNewProjectName;
  } else if (isCrossTeamMatch(projectOrNewProjectName)) {
    return await linkCrossTeamMatch({
      client,
      path,
      match: projectOrNewProjectName,
      successEmoji,
      autoConfirm,
      pullEnv,
    });
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
  const rootServicesSetup = await getServicesSetupState(path);
  const configFileName =
    (await findSourceVercelConfigFile(path)) ?? 'vercel.json';

  try {
    let settings: ProjectSettings = {};
    let pathWithRootDirectory = path;
    let rootInferredServicesChoice: InferredServicesChoice | null = null;

    if (!rootServicesSetup.hasConfiguredServices) {
      rootInferredServicesChoice = await promptForInferredServicesSetup({
        client,
        autoConfirm,
        nonInteractive,
        workPath: path,
        inferred: rootServicesSetup.inferredServices,
        inferredWriteBlocker: rootServicesSetup.inferredServicesWriteBlocker,
        allowChooseDifferentProjectDirectory: true,
      });
    }

    // Setup priority:
    // 1. Explicit services config at the repo root.
    // 2. Inferred services layout at the repo root -> prompt for deployment mode.
    // 3. Standard framework setup flow.
    if (rootServicesSetup.hasConfiguredServices) {
      displayConfiguredServicesSetup(
        rootServicesSetup.detectServicesResult,
        configFileName
      );
      settings.framework = 'services';
    } else if (rootInferredServicesChoice?.type === 'services') {
      settings.framework = 'services';
    } else {
      // Standard framework setup begins here. The selected root directory
      // gets the same priority order as the repo root:
      // configured services -> inferred services -> framework/Other.
      const skipSelectedRootInferredServicesPrompt =
        rootInferredServicesChoice?.type === 'single-app';

      if (rootInferredServicesChoice?.type === 'single-app') {
        rootDirectory = toProjectRootDirectory(
          path,
          rootInferredServicesChoice.selectedPath
        );
      } else {
        // Prompt for a root directory when the user explicitly asked for one
        // via the inferred-services picker, or — in the standard flow — when
        // this is a workspace (monorepo with multiple packages), or when no
        // framework is detected at the root (nested monolith layouts like
        // `repo/app/package.json`). For single-app projects with a framework
        // at the root we skip the prompt entirely.
        const shouldPromptRoot = await shouldPromptForRootDirectory({
          path,
          servicesChoice: rootInferredServicesChoice,
        });
        if (shouldPromptRoot) {
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
        }
      }

      pathWithRootDirectory = rootDirectory ? join(path, rootDirectory) : path;
      const selectedRootServicesSetup =
        pathWithRootDirectory === path
          ? null
          : await getServicesSetupState(pathWithRootDirectory);
      let selectedRootInferredServicesChoice: InferredServicesChoice | null =
        null;
      if (!skipSelectedRootInferredServicesPrompt) {
        selectedRootInferredServicesChoice =
          await promptForInferredServicesSetup({
            client,
            autoConfirm,
            nonInteractive,
            workPath: pathWithRootDirectory,
            inferred: selectedRootServicesSetup?.inferredServices ?? null,
            inferredWriteBlocker:
              selectedRootServicesSetup?.inferredServicesWriteBlocker ?? null,
          });
      }

      if (selectedRootServicesSetup?.hasConfiguredServices) {
        displayConfiguredServicesSetup(
          selectedRootServicesSetup.detectServicesResult,
          configFileName
        );
        settings.framework = 'services';
      } else if (selectedRootInferredServicesChoice?.type === 'services') {
        settings.framework = 'services';
      } else {
        if (selectedRootInferredServicesChoice?.type === 'single-app') {
          rootDirectory = toProjectRootDirectory(
            path,
            selectedRootInferredServicesChoice.selectedPath
          );
          pathWithRootDirectory = rootDirectory
            ? join(path, rootDirectory)
            : path;
        }

        const localConfig = await readConfig(pathWithRootDirectory);
        if (localConfig instanceof CantParseJSONFile) {
          output.prettyError(localConfig);
          return { status: 'error', exitCode: 1 };
        }

        const isZeroConfig =
          !localConfig ||
          !localConfig.builds ||
          localConfig.builds.length === 0;

        if (isZeroConfig) {
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
            localConfigurationOverrides,
            configFileName
          );
        }
      }
    }

    // Support for changing additional, less frequently used project settings.
    let changeAdditionalSettings = false;
    if (!autoConfirm) {
      changeAdditionalSettings = await client.input.confirm(
        'Customize advanced settings?',
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
      false, // don't prompt to pull env for newly created projects
      'Created'
    );

    await connectGitRepository(client, path, project, autoConfirm, org);

    return { status: 'linked', org, project };
  } catch (err) {
    if (isPromptCanceledError(err)) {
      throw err;
    }
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

    output.print('\n');

    const shouldConnect =
      autoConfirm ||
      (await client.input.confirm(`Connect detected Git repository?`, true));

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
    if (isPromptCanceledError(error)) {
      return;
    }
    // Silently ignore git connection errors to not disrupt the main flow
    output.debug(`Failed to connect git repository: ${error}`);
  }
}
