import chalk from 'chalk';
import pluralize from 'pluralize';
import { homedir } from 'os';
import { join } from 'path';
import { normalizePath, traverseUpDirectories } from '@vercel/build-utils';
import { lstat, readJSON, outputJSON } from 'fs-extra';
import { VERCEL_DIR, VERCEL_DIR_REPO, writeReadme } from '../projects/link';
import { emoji, prependEmoji } from '../emoji';
import { addToGitIgnore } from './add-to-gitignore';
import type Client from '../client';
import { getGitRootDirectory } from '../git-helpers';
import output from '../../output-manager';

const home = homedir();

export interface RepoProjectConfig {
  id: string;
  name: string;
  directory: string;
  orgId?: string;
}

export interface RepoProjectsConfig {
  /**
   * @deprecated Use `orgId` on each project entry instead.
   * Kept for backwards compatibility with older `repo.json` files.
   */
  orgId?: string;
  remoteName: string;
  projects: RepoProjectConfig[];
}

export interface RepoLink {
  rootPath: string;
  repoConfigPath: string;
  repoConfig?: RepoProjectsConfig;
}

export interface EnsureRepoLinkOptions {
  yes: boolean;
  overwrite: boolean;
  /**
   * Experimental repo link: resolve this project by name or id in the selected
   * scope, run framework detection for path/git suggestions, and do not offer
   * “new project” rows from local detection.
   */
  projectName?: string | null;
}

function mergeKeyForRepoProject(
  p: RepoProjectConfig,
  topLevelOrgId?: string
): string {
  const org = p.orgId ?? topLevelOrgId ?? '';
  const dir = normalizePath(p.directory);
  return `${org}\n${dir}`;
}

/**
 * Merge `incoming` into `existing` by `(orgId, directory)` (org falls back to
 * top-level `repo.json` orgId). Matching keys are replaced; other existing rows
 * are kept.
 */
export function mergeRepoProjectEntries(
  existing: RepoProjectConfig[],
  incoming: RepoProjectConfig[],
  topLevelOrgId?: string
): RepoProjectConfig[] {
  const map = new Map<string, RepoProjectConfig>();
  for (const p of existing) {
    map.set(mergeKeyForRepoProject(p, topLevelOrgId), p);
  }
  for (const p of incoming) {
    map.set(mergeKeyForRepoProject(p, topLevelOrgId), p);
  }
  return [...map.values()];
}

/**
 * Given a directory path `cwd`, finds the root of the Git repository
 * and returns the parsed `.vercel/repo.json` file if the repository
 * has already been linked.
 */
export async function getRepoLink(
  client: Client,
  cwd: string
): Promise<RepoLink | undefined> {
  // Determine where the root of the repo is
  const rootPath = await findRepoRoot(cwd);
  if (!rootPath) return undefined;

  // Read the `repo.json`, if this repo has already been linked
  const repoConfigPath = join(rootPath, VERCEL_DIR, VERCEL_DIR_REPO);
  const repoConfig: RepoProjectsConfig = await readJSON(repoConfigPath).catch(
    err => {
      if (err.code !== 'ENOENT') throw err;
    }
  );

  return { rootPath, repoConfig, repoConfigPath };
}

/**
 * Runs the project discovery flow (`vc link --repo` / `vc link add`): selects org,
 * discovers/creates projects, and returns the selected projects as `RepoProjectConfig[]`.
 *
 * This is the shared core used by both `ensureRepoLink` and `addRepoLink`.
 *
 * @param existingProjectIds - Set of project IDs already in repo.json,
 *   used to filter out already-linked projects from the API results.
 * @param existingDirectories - Set of directories already linked in repo.json,
 *   used to filter out locally-detected projects that are already covered.
 */
async function discoverRepoProjects(
  client: Client,
  rootPath: string,
  options: {
    yes: boolean;
    existingProjectIds?: Set<string>;
    existingDirectories?: Set<string>;
    /** When set, skip the remote selection prompt and use this remote. */
    existingRemoteName?: string;
    /** Target project by name; excludes local “new project” suggestions. */
    projectName?: string | null;
    /** `initial` = `vc link --repo`; `add` = `vc link add`. */
    repoLinkMode: 'initial' | 'add';
  }
): Promise<
  | {
      remoteName: string;
      projects: RepoProjectConfig[];
      orgSlug: string;
      repoLinkNoop?: boolean;
    }
  | undefined
> {
  const { discoverRepoProjectsExperimental } = await import(
    './experimental-repo/discover-repo-projects'
  );
  return discoverRepoProjectsExperimental(client, rootPath, options);
}

export async function ensureRepoLink(
  client: Client,
  cwd: string,
  { yes, overwrite, projectName }: EnsureRepoLinkOptions
): Promise<RepoLink | undefined> {
  const repoLink = await getRepoLink(client, cwd);
  if (repoLink) {
    output.debug(`Found Git repository root directory: ${repoLink.rootPath}`);
  } else {
    throw new Error('Could not determine Git repository root directory');
  }
  let { rootPath, repoConfig, repoConfigPath } = repoLink;

  if (overwrite || !repoConfig) {
    const result = await discoverRepoProjects(client, rootPath, {
      yes,
      projectName,
      repoLinkMode: 'initial',
      ...(repoConfig?.projects?.length
        ? {
            existingProjectIds: new Set(repoConfig.projects.map(p => p.id)),
            existingDirectories: new Set(
              repoConfig.projects.map(p => p.directory)
            ),
          }
        : {}),
    });
    if (!result) {
      return;
    }

    if (result.repoLinkNoop) {
      output.print(
        prependEmoji(
          `Repository link is already saved (${VERCEL_DIR}/${VERCEL_DIR_REPO}).\n`,
          emoji('link')
        )
      );
      return {
        repoConfig,
        repoConfigPath,
        rootPath,
      };
    }

    if (!repoConfig) {
      repoConfig = {
        remoteName: result.remoteName,
        projects: result.projects,
      };
    } else {
      repoConfig = {
        ...repoConfig,
        remoteName: result.remoteName,
        projects: mergeRepoProjectEntries(
          repoConfig.projects,
          result.projects,
          repoConfig.orgId
        ),
      };
    }
    await outputJSON(repoConfigPath, repoConfig, { spaces: 2 });

    await writeReadme(rootPath);

    // update .gitignore
    const isGitIgnoreUpdated = await addToGitIgnore(rootPath);

    output.print(
      prependEmoji(
        `Linked to ${pluralize(
          'Project',
          result.projects.length,
          true
        )} under ${chalk.bold(result.orgSlug)} (created ${VERCEL_DIR}${
          isGitIgnoreUpdated ? ' and added it to .gitignore' : ''
        })`,
        emoji('link')
      ) + '\n'
    );
  }

  return {
    repoConfig,
    repoConfigPath,
    rootPath,
  };
}

/**
 * Adds additional projects to an existing `repo.json` file.
 * Requires that `repo.json` already exists (i.e., the repo has been linked
 * with `vc link --repo`). Runs the same project discovery flow and merges
 * the resulting projects into the existing config, deduplicating by project ID.
 */
export async function addRepoLink(
  client: Client,
  cwd: string,
  { yes }: { yes: boolean }
): Promise<RepoLink | undefined> {
  const repoLink = await getRepoLink(client, cwd);
  if (!repoLink) {
    throw new Error('Could not determine Git repository root directory');
  }

  const { rootPath, repoConfig, repoConfigPath } = repoLink;

  if (!repoConfig) {
    throw new Error(
      `No existing repository link found. Run \`vc link --repo\` first to link the repository.`
    );
  }

  output.debug(`Found Git repository root directory: ${rootPath}`);

  // Collect existing project IDs and directories so we can filter them
  const existingProjectIds = new Set(repoConfig.projects.map(p => p.id));
  const existingDirectories = new Set(
    repoConfig.projects.map(p => p.directory)
  );

  const result = await discoverRepoProjects(client, rootPath, {
    yes,
    existingProjectIds,
    existingDirectories,
    existingRemoteName: repoConfig.remoteName,
    repoLinkMode: 'add',
  });
  if (!result) {
    return;
  }

  if (result.projects.length === 0) {
    output.print(`No new Projects were added.\n`);
    return { repoConfig, repoConfigPath, rootPath };
  }

  // Merge new projects into existing config, deduplicating by project ID
  const mergedProjects = [...repoConfig.projects];
  for (const project of result.projects) {
    if (!existingProjectIds.has(project.id)) {
      mergedProjects.push(project);
    }
  }

  const updatedConfig: RepoProjectsConfig = {
    ...repoConfig,
    projects: mergedProjects,
  };

  await outputJSON(repoConfigPath, updatedConfig, { spaces: 2 });

  output.print(
    prependEmoji(
      `Added ${pluralize(
        'Project',
        result.projects.length,
        true
      )} under ${chalk.bold(result.orgSlug)}`,
      emoji('link')
    ) + '\n'
  );

  return {
    repoConfig: updatedConfig,
    repoConfigPath,
    rootPath,
  };
}

/**
 * Given a `start` directory, finds the root of the Git repository.
 *
 * First traverses up the directory hierarchy looking for `.vercel/repo.json`
 * (indicating an already-linked repository). If not found, uses
 * `git rev-parse --show-toplevel` to find the Git root, which correctly
 * handles regular repositories, worktrees, and submodules. Falls back to
 * filesystem traversal looking for `.git` as a last resort.
 *
 * Returns `undefined` when no Git repo was found or if the home directory
 * is reached (to avoid matching dotfile repos).
 */
export async function findRepoRoot(start: string): Promise<string | undefined> {
  const { debug } = output;
  const REPO_JSON_PATH = join(VERCEL_DIR, VERCEL_DIR_REPO);

  for (const current of traverseUpDirectories({ start })) {
    if (current === home) {
      // Sometimes the $HOME directory is set up as a Git repo
      // (for dotfiles, etc.). In this case it's safe to say that
      // this isn't the repo we're looking for. Bail.
      debug('Arrived at home directory');
      break;
    }

    // if `.vercel/repo.json` exists (already linked),
    // then consider this the repo root
    const repoConfigPath = join(current, REPO_JSON_PATH);
    const stat = await lstat(repoConfigPath).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    if (stat) {
      debug(`Found "${REPO_JSON_PATH}" - detected "${current}" as repo root`);
      return current;
    }
  }

  // Use `git rev-parse --show-toplevel` to find the git root.
  // This correctly handles regular repos, worktrees, and submodules.
  const gitRoot = getGitRootDirectory({ cwd: start });
  if (gitRoot) {
    debug(
      `Found git root via "git rev-parse --show-toplevel" - detected "${gitRoot}" as repo root`
    );
    return gitRoot;
  }

  // Fallback: traverse up looking for `.git` directory or file.
  // This handles cases where git commands fail (e.g., in test environments
  // or when git is not installed).
  for (const current of traverseUpDirectories({ start })) {
    if (current === home) {
      debug('Arrived at home directory');
      break;
    }

    const gitPath = join(current, '.git');
    const stat = await lstat(gitPath).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    if (stat) {
      debug(`Found ".git" - detected "${current}" as repo root`);
      return current;
    }
  }

  debug('Aborting search for repo root');
}

function sortByDirectory(a: RepoProjectConfig, b: RepoProjectConfig): number {
  const aParts = a.directory.split('/');
  const bParts = b.directory.split('/');
  return bParts.length - aParts.length;
}

/**
 * Finds the matching Projects from an array of Project links
 * where the provided relative path is within the Project's
 * root directory.
 */
export function findProjectsFromPath(
  projects: RepoProjectConfig[],
  path: string
): RepoProjectConfig[] {
  const normalizedPath = normalizePath(path);
  const matches = projects
    .slice()
    .sort(sortByDirectory)
    .filter(project => {
      if (project.directory === '.') {
        // Project has no "Root Directory" setting, so any path is valid
        return true;
      }
      return (
        normalizedPath === project.directory ||
        normalizedPath.startsWith(`${project.directory}/`)
      );
    });
  // If there are multiple matches, we only want the most relevant
  // selections (with the deepest directory depth), so pick the first
  // one and filter on those matches.
  const firstMatch = matches[0];
  return matches.filter(match => match.directory === firstMatch.directory);
}
