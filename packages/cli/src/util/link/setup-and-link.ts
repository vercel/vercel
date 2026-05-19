import chalk from 'chalk';
import { remove } from 'fs-extra';
import { join, basename } from 'path';
import { LocalFileSystemDetector, getWorkspaces } from '@vercel/fs-detectors';
import type {
  ProjectLinkResult,
  ProjectSettings,
  Org,
  Team,
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
import { findSourceVercelConfigFile } from '../compile-vercel-config';
import { frameworkList } from '@vercel/frameworks';
import {
  vercelAuth,
  type VercelAuthSetting,
  DEFAULT_VERCEL_AUTH_SETTING,
} from '../input/vercel-auth';
import {
  displayConfiguredServicesSetup,
  getServicesSetupState,
  promptForInferredServicesSetup,
  toProjectRootDirectory,
  type InferredServicesChoice,
} from './services-setup';
import searchProjectAcrossTeams from '../projects/search-project-across-teams';
import type { CrossTeamMatch } from '../projects/search-project-across-teams';

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
  /** When true, search matching projects across teams before standard linking flow */
  searchAcrossTeams?: boolean;
}

function formatMatchReason(match: CrossTeamMatch): string {
  if (match.reason === 'repo-root') {
    return chalk.gray('(linked by git)');
  }
  return chalk.gray('(folder name)');
}

function formatCrossTeamMatch(match: CrossTeamMatch): string {
  return `${chalk.bold(match.org.slug)}/${match.project.name} ${formatMatchReason(
    match
  )}`;
}

function formatTeamList(slugs: string[]): string {
  const shown = slugs.slice(0, 5);
  const suffix =
    slugs.length > shown.length
      ? `, and ${slugs.length - shown.length} more`
      : '';
  return `${shown.join(', ')}${suffix}`;
}

function printCrossTeamSearchScope({
  searchedTeamSlugs,
  skippedLimitedTeamSlugs,
}: {
  searchedTeamSlugs: string[];
  skippedLimitedTeamSlugs: string[];
}): void {
  if (searchedTeamSlugs.length > 0) {
    output.print(`  Searched teams: ${formatTeamList(searchedTeamSlugs)}\n`);
  }
  if (skippedLimitedTeamSlugs.length > 0) {
    output.print(
      `  Skipped ${skippedLimitedTeamSlugs.length} SSO-protected ${skippedLimitedTeamSlugs.length === 1 ? 'team' : 'teams'}\n`
    );
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

  const pullEnvConfirmed =
    autoConfirm ||
    (await client.input.confirm(
      'Would you like to pull environment variables now?',
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

async function promptForLimitedTeams(
  client: Client,
  teams: Team[]
): Promise<Team[]> {
  if (teams.length === 0) {
    return [];
  }

  return await client.input.checkbox<Team>({
    message: 'Which SSO-protected teams should be searched?',
    choices: teams.map(team => ({
      name: team.name ? `${team.name} (${team.slug})` : team.slug,
      value: team,
    })),
  });
}

async function searchSelectedLimitedTeams({
  client,
  path,
  projectName,
  gitProjectName,
  teams,
}: {
  client: Client;
  path: string;
  projectName: string;
  gitProjectName?: string;
  teams: Team[];
}): Promise<CrossTeamMatch[]> {
  const selectedTeams = await promptForLimitedTeams(client, teams);
  if (selectedTeams.length === 0) {
    return [];
  }

  output.spinner('Searching selected SSO-protected teams…', 1000);
  try {
    const result = await searchProjectAcrossTeams(client, projectName, path, {
      teams: selectedTeams,
      skipLimited: false,
      gitProjectName,
    });
    printCrossTeamSearchScope({
      searchedTeamSlugs: result.searchedTeamSlugs,
      skippedLimitedTeamSlugs: [],
    });
    return result.matches;
  } catch (err) {
    output.debug(`Selected SSO-protected team search failed: ${err}`);
    return [];
  } finally {
    output.stopSpinner();
  }
}

async function linkCrossTeamMatches({
  client,
  path,
  matches,
  successEmoji,
  autoConfirm,
  nonInteractive,
  pullEnv,
}: {
  client: Client;
  path: string;
  matches: CrossTeamMatch[];
  successEmoji: EmojiLabel;
  autoConfirm: boolean;
  nonInteractive: boolean;
  pullEnv: boolean;
}): Promise<ProjectLinkResult | null> {
  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    const match = matches[0];

    if (autoConfirm || nonInteractive) {
      return await linkCrossTeamMatch({
        client,
        path,
        match,
        successEmoji,
        autoConfirm,
        pullEnv,
      });
    }

    const confirmed = await client.input.confirm(
      `Found project ${formatCrossTeamMatch(match)}. Link to it?`,
      true
    );
    if (confirmed) {
      return await linkCrossTeamMatch({
        client,
        path,
        match,
        successEmoji,
        autoConfirm,
        pullEnv,
      });
    }
    return null;
  }

  const currentTeamMatch = matches.find(
    match => match.org.id === client.config.currentTeam
  );

  if (autoConfirm && currentTeamMatch) {
    return await linkCrossTeamMatch({
      client,
      path,
      match: currentTeamMatch,
      successEmoji,
      autoConfirm,
      pullEnv,
    });
  }

  if (nonInteractive) {
    return null;
  }

  const choices = matches.map(match => ({
    name: formatCrossTeamMatch(match),
    value: match as CrossTeamMatch | null,
  }));
  choices.push({
    name: 'Not one of these projects',
    value: null,
  });

  const selected = await client.input.select<CrossTeamMatch | null>({
    message:
      'Found matching projects across teams. Which one do you want to link?',
    choices,
    default: currentTeamMatch ?? undefined,
  });

  if (!selected) {
    return null;
  }

  return await linkCrossTeamMatch({
    client,
    path,
    match: selected,
    successEmoji,
    autoConfirm,
    pullEnv,
  });
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
    projectName,
    nonInteractive = false,
    pullEnv = true,
    v0,
    searchAcrossTeams = false,
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

  // Status line — intent is implied by the user running `vc` in this directory.
  // The "Set up and deploy?" confirmation prompt is gone; Ctrl-C is the escape hatch.
  // Single leading newline, 2-space indent, straight quotes — matches the prototype.
  output.print(
    `\n  ${chalk.bold(setupMsg)} ${chalk.dim(`"${toHumanPath(path)}"`)}\n`
  );

  let skipAutoDetect = false;
  if (searchAcrossTeams) {
    // Search for existing projects across all teams
    let crossTeamMatches: CrossTeamMatch[] = [];
    let searchedTeamSlugs: string[] = [];
    let skippedLimitedTeamSlugs: string[] = [];
    let skippedLimitedTeams: Team[] = [];
    output.spinner('Searching for existing projects…', 1000);
    try {
      const searchResult = await searchProjectAcrossTeams(
        client,
        projectName,
        path,
        {
          autoConfirm,
          nonInteractive,
          gitProjectName,
        }
      );
      crossTeamMatches = searchResult.matches;
      searchedTeamSlugs = searchResult.searchedTeamSlugs;
      skippedLimitedTeamSlugs = searchResult.skippedLimitedTeamSlugs;
      skippedLimitedTeams = searchResult.skippedLimitedTeams;
    } catch (err) {
      output.debug(`Cross-team search failed: ${err}`);
    } finally {
      output.stopSpinner();
    }

    if (crossTeamMatches.length > 0 && !autoConfirm && !nonInteractive) {
      printCrossTeamSearchScope({
        searchedTeamSlugs,
        skippedLimitedTeamSlugs,
      });
    }

    const linkedMatch = await linkCrossTeamMatches({
      client,
      path,
      matches: crossTeamMatches,
      successEmoji,
      autoConfirm,
      nonInteractive,
      pullEnv,
    });
    if (linkedMatch) {
      return linkedMatch;
    }

    if (!autoConfirm && !nonInteractive && skippedLimitedTeams.length > 0) {
      if (crossTeamMatches.length === 0) {
        output.print(
          `  No matching projects found in the ${searchedTeamSlugs.length} ${searchedTeamSlugs.length === 1 ? 'team' : 'teams'} available in your current session.\n`
        );
      }
      const limitedTeamMatches = await searchSelectedLimitedTeams({
        client,
        path,
        projectName,
        gitProjectName,
        teams: skippedLimitedTeams,
      });
      const linkedLimitedMatch = await linkCrossTeamMatches({
        client,
        path,
        matches: limitedTeamMatches,
        successEmoji,
        autoConfirm,
        nonInteractive,
        pullEnv,
      });
      if (linkedLimitedMatch) {
        return linkedLimitedMatch;
      }
      if (limitedTeamMatches.length === 0) {
        output.print(
          '  No matching projects found in the selected SSO-protected teams.\n'
        );
      }
      skipAutoDetect =
        skipAutoDetect ||
        crossTeamMatches.length > 0 ||
        limitedTeamMatches.length > 0;
    } else if (crossTeamMatches.length > 0) {
      skipAutoDetect = true;
    }
  }

  try {
    org = await selectOrg(client, 'Which team?', autoConfirm);
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
      autoConfirm,
      skipAutoDetect
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
