import chalk from 'chalk';
import { homedir } from 'node:os';
import { join, normalize } from 'node:path';
import { lstat, readJSON, outputJSON } from 'fs-extra';
import confirm from '../input/confirm';
import toHumanPath from '../humanize-path';
import type Client from '../client';
import { VERCEL_DIR } from '../projects/link';
import { getRemoteUrls } from '../create-git-meta';
import { Project } from '../../types';
import link from '../output/link';
import { emoji, prependEmoji } from '../emoji';

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

export interface RepoLink extends RepoProjectsConfig {
  repoRoot: string;
}

/**
 *
 */
export async function ensureRepoLink(
  client: Client,
  cwd: string,
  yes = false
): Promise<RepoLink | undefined> {
  const { output } = client;

  // First order of business is to determine where the root of the repo is
  const repoRoot = await findRepoRoot(cwd);
  output.debug(`Found Git repository root directory: ${repoRoot}`);
  if (!repoRoot) {
    throw new Error('Could not determine Git repository root directory');
  }

  // Read the `repo.json`, if this repo has already been linked
  const repoConfigPath = join(repoRoot, VERCEL_DIR, 'repo.json');
  let repoConfig: RepoProjectsConfig | undefined = await readJSON(
    repoConfigPath
  ).catch(err => {
    if (err.code !== 'ENOENT') throw err;
  });

  if (!repoConfig) {
    // Not yet linked, so prompt user to begin linking
    let shouldLink =
      yes ||
      (await confirm(
        client,
        `Link to Git repository at ${chalk.cyan(
          `“${toHumanPath(repoRoot)}”`
        )}?`,
        true
      ));

    if (!shouldLink) {
      output.print(`Canceled. Repository not linked.\n`);
      return;
    }

    const remoteUrls = await getRemoteUrls(
      join(repoRoot, '.git/config'),
      output
    );
    if (!remoteUrls) {
      throw new Error('Could not determit Git remote URLs');
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
    output.spinner(`Fetching Projects for ${link(repoUrl)} on "vercel" team…`);
    const query = new URLSearchParams({ repoUrl, limit: '100' });
    const projects: Project[] = await client.fetch(`/v2/projects?${query}`);
    if (projects.length === 0) {
      output.log(
        `No Projects are linked to ${link(repoUrl)} on "vercel" team.`
      );
      // TODO: run detection logic to find potential projects.
      // then prompt user to select valid projects.
      // then create new Projects
    } else {
      output.log(
        `Found ${chalk.bold(projects.length)} Projects linked to ${link(
          repoUrl
        )} on "vercel" team:`
      );
    }

    const projectsMeta = projects.map(project => {
      output.print(`  * ${chalk.cyan(`vercel/${project.name}\n`)}`);
      return {
        id: project.id,
        name: project.name,
        directory: normalize(project.rootDirectory || ''),
      };
    });

    shouldLink = yes || (await confirm(client, `Link to them?`, true));

    if (!shouldLink) {
      output.print(`Canceled. Repository not linked.\n`);
      return;
    }

    repoConfig = {
      orgId: '1234',
      remoteName,
      projects: projectsMeta,
    };
    await outputJSON(repoConfigPath, repoConfig, { spaces: 2 });
    // TODO: add `README.txt`

    let isGitIgnoreUpdated = false;
    output.print(
      prependEmoji(
        `Linked to ${link(repoUrl)} on "vercel" Team (created ${VERCEL_DIR}${
          isGitIgnoreUpdated ? ' and added it to .gitignore' : ''
        })`,
        emoji('link')
      ) + '\n'
    );
  }

  return {
    ...repoConfig,
    repoRoot,
  };
}

/**
 * Given a `start` directory, traverses up the directory hierarchy until
 * the nearest `.git/config` file is found. Returns the directory where
 * the Git config was found, or `undefined` when no Git repo was found.
 */
export async function findRepoRoot(start: string): Promise<string | undefined> {
  for (const current of traverseDirectories(start)) {
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

export function* traverseDirectories(start: string) {
  let current: string | undefined = normalize(start);
  while (current) {
    yield current;
    // Go up one directory
    const next = join(current, '..');
    current = next === current ? undefined : next;
  }
}
