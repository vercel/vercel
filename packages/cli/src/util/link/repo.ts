import chalk from 'chalk';
import pluralize from 'pluralize';
import { homedir } from 'os';
import { join, normalize } from 'path';
import { normalizePath } from '@vercel/build-utils';
import { lstat, readJSON, outputJSON, writeFile, readFile } from 'fs-extra';
import confirm from '../input/confirm';
import toHumanPath from '../humanize-path';
import {
  VERCEL_DIR,
  VERCEL_DIR_README,
  VERCEL_DIR_REPO,
} from '../projects/link';
import { getRemoteUrls } from '../create-git-meta';
import link from '../output/link';
import { emoji, prependEmoji } from '../emoji';
import selectOrg from '../input/select-org';
import { addToGitIgnore } from './add-to-gitignore';
import type Client from '../client';
import type { Project } from '@vercel-internals/types';

const home = homedir();

export interface RepoProjectConfig {
  id: string;
  name: string;
  directory: string;
}

export interface RepoProjectsConfig {
  orgId: string;
  remoteName: string;
  projects: RepoProjectConfig[];
}

export interface RepoLink {
  rootPath: string;
  repoConfigPath: string;
  repoConfig?: RepoProjectsConfig;
}

/**
 * Given a directory path `cwd`, finds the root of the Git repository
 * and returns the parsed `.vercel/repo.json` file if the repository
 * has already been linked.
 */
export async function getRepoLink(cwd: string): Promise<RepoLink | undefined> {
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

export async function ensureRepoLink(
  client: Client,
  cwd: string,
  yes = false
): Promise<RepoLink | undefined> {
  const { output } = client;

  const repoLink = await getRepoLink(cwd);
  if (repoLink) {
    output.debug(`Found Git repository root directory: ${repoLink.rootPath}`);
  } else {
    throw new Error('Could not determine Git repository root directory');
  }
  let { rootPath, repoConfig, repoConfigPath } = repoLink;

  if (!repoConfig) {
    // Not yet linked, so prompt user to begin linking
    let shouldLink =
      yes ||
      (await confirm(
        client,
        `Link Git repository at ${chalk.cyan(
          `“${toHumanPath(rootPath)}”`
        )} to your Project(s)?`,
        true
      ));

    if (!shouldLink) {
      output.print(`Canceled. Repository not linked.\n`);
      return;
    }

    const org = await selectOrg(
      client,
      'Which scope should contain your Project(s)?',
      yes
    );
    client.config.currentTeam = org.type === 'team' ? org.id : undefined;

    const remoteUrls = await getRemoteUrls(
      join(rootPath, '.git/config'),
      output
    );
    if (!remoteUrls) {
      throw new Error('Could not determine Git remote URLs');
    }
    const remoteNames = Object.keys(remoteUrls);
    let remoteName: string;
    if (remoteNames.length === 1) {
      remoteName = remoteNames[0];
    } else {
      // Prompt user to select which remote to use
      const originIndex = remoteNames.indexOf('origin');
      const answer = await client.prompt({
        type: 'list',
        name: 'value',
        message: 'Which Git remote should be used?',
        choices: remoteNames.map(name => {
          return { name: name, value: name };
        }),
        default: originIndex === -1 ? 0 : originIndex,
      });
      remoteName = answer.value;
    }
    const repoUrl = remoteUrls[remoteName];
    output.spinner(
      `Fetching Projects for ${link(repoUrl)} under ${chalk.bold(org.slug)}…`
    );
    // TODO: Add pagination to fetch all Projects
    const query = new URLSearchParams({ repoUrl, limit: '100' });
    const projects: Project[] = await client.fetch(`/v2/projects?${query}`);
    if (projects.length === 0) {
      output.log(
        `No Projects are linked to ${link(repoUrl)} under ${chalk.bold(
          org.slug
        )}.`
      );
      // TODO: run detection logic to find potential projects.
      // then prompt user to select valid projects.
      // then create new Projects
    } else {
      output.log(
        `Found ${chalk.bold(projects.length)} ${pluralize(
          'Project',
          projects.length
        )} linked to ${link(repoUrl)} under ${chalk.bold(org.slug)}:`
      );
    }

    for (const project of projects) {
      output.print(`  * ${chalk.cyan(`${org.slug}/${project.name}\n`)}`);
    }

    shouldLink =
      yes ||
      (await confirm(
        client,
        `Link to ${projects.length === 1 ? 'it' : 'them'}?`,
        true
      ));

    if (!shouldLink) {
      output.print(`Canceled. Repository not linked.\n`);
      return;
    }

    repoConfig = {
      orgId: org.id,
      remoteName,
      projects: projects.map(project => {
        return {
          id: project.id,
          name: project.name,
          directory: normalize(project.rootDirectory || ''),
        };
      }),
    };
    await outputJSON(repoConfigPath, repoConfig, { spaces: 2 });

    await writeFile(
      join(rootPath, VERCEL_DIR, VERCEL_DIR_README),
      await readFile(join(__dirname, 'VERCEL_DIR_README.txt'), 'utf8')
    );

    // update .gitignore
    const isGitIgnoreUpdated = await addToGitIgnore(rootPath);

    output.print(
      prependEmoji(
        `Linked to ${link(repoUrl)} under ${chalk.bold(
          org.slug
        )} (created ${VERCEL_DIR}${
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
 * Given a `start` directory, traverses up the directory hierarchy until
 * the nearest `.git/config` file is found. Returns the directory where
 * the Git config was found, or `undefined` when no Git repo was found.
 */
export async function findRepoRoot(start: string): Promise<string | undefined> {
  for (const current of traverseUpDirectories(start)) {
    if (current === home) {
      // Sometimes the $HOME directory is set up as a Git repo
      // (for dotfiles, etc.). In this case it's safe to say that
      // this isn't the repo we're looking for. Bail.
      break;
    }

    const gitConfigPath = join(current, '.git/config');
    const stat = await lstat(gitConfigPath).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    if (stat) {
      return current;
    }
  }
}

export function* traverseUpDirectories(start: string) {
  let current: string | undefined = normalize(start);
  while (current) {
    yield current;
    // Go up one directory
    const next = join(current, '..');
    current = next === current ? undefined : next;
  }
}

function sortByDirectory(a: RepoProjectConfig, b: RepoProjectConfig): number {
  const aParts = a.directory.split('/');
  const bParts = b.directory.split('/');
  return bParts.length - aParts.length;
}

/**
 * Finds the matching Project from an array of Project links
 * where the provided relative path is within the Project's
 * root directory.
 */
export function findProjectFromPath(
  projects: RepoProjectConfig[],
  path: string
): RepoProjectConfig | undefined {
  const normalizedPath = normalizePath(path);
  return projects
    .slice()
    .sort(sortByDirectory)
    .find(project => {
      if (project.directory === '.') {
        // Project has no "Root Directory" setting, so any path is valid
        return true;
      }
      return (
        normalizedPath === project.directory ||
        normalizedPath.startsWith(`${project.directory}/`)
      );
    });
}
