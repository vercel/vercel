import chalk from 'chalk';
import { Separator } from '@inquirer/checkbox';
import pluralize from 'pluralize';
import { homedir } from 'os';
import slugify from '@sindresorhus/slugify';
import { basename, join, normalize } from 'path';
import { normalizePath, traverseUpDirectories } from '@vercel/build-utils';
import { lstat, readJSON, outputJSON } from 'fs-extra';
import confirm from '../input/confirm';
import toHumanPath from '../humanize-path';
import { VERCEL_DIR, VERCEL_DIR_REPO, writeReadme } from '../projects/link';
import { getRemoteUrls } from '../create-git-meta';
import link from '../output/link';
import { emoji, prependEmoji } from '../emoji';
import selectOrg from '../input/select-org';
import { addToGitIgnore } from './add-to-gitignore';
import type Client from '../client';
import type { Framework } from '@vercel/frameworks';
import type { Project } from '@vercel-internals/types';
import createProject from '../projects/create-project';
import { detectProjects } from '../projects/detect-projects';
import { repoInfoToUrl } from '../git/repo-info-to-url';
import { connectGitProvider, parseRepoUrl } from '../git/connect-git-provider';
import { isGitWorktreeOrSubmodule } from '../git-helpers';
import output from '../../output-manager';

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

export interface EnsureRepoLinkOptions {
  yes: boolean;
  overwrite: boolean;
}

interface NewProject {
  newProject?: true;
  rootDirectory?: string;
  name: string;
  framework: Framework;
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
  const rootPath = await findRepoRoot(client, cwd);
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
  { yes, overwrite }: EnsureRepoLinkOptions
): Promise<RepoLink | undefined> {
  const repoLink = await getRepoLink(client, cwd);
  if (repoLink) {
    output.debug(`Found Git repository root directory: ${repoLink.rootPath}`);
  } else {
    throw new Error('Could not determine Git repository root directory');
  }
  let { rootPath, repoConfig, repoConfigPath } = repoLink;

  if (overwrite || !repoConfig) {
    // Detect the projects on the filesystem out of band, so that
    // they will be ready by the time the projects are listed
    const detectedProjectsPromise = detectProjects(rootPath).catch(err => {
      output.debug(`Failed to detect local projects: ${err}`);
      return new Map<string, Framework[]>();
    });

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

    const remoteUrls = await getRemoteUrls(join(rootPath, '.git/config'));
    if (!remoteUrls) {
      throw new Error('Could not determine Git remote URLs');
    }
    const remoteNames = Object.keys(remoteUrls).sort();
    let remoteName: string;
    if (remoteNames.length === 1) {
      remoteName = remoteNames[0];
    } else {
      // Prompt user to select which remote to use
      const defaultRemote = remoteNames.includes('origin')
        ? 'origin'
        : remoteNames[0];
      if (yes) {
        remoteName = defaultRemote;
      } else {
        remoteName = await client.input.select({
          message: 'Which Git remote should be used?',
          choices: remoteNames.map(name => {
            return { name: name, value: name };
          }),
          default: defaultRemote,
        });
      }
    }
    const repoUrl = remoteUrls[remoteName];
    const parsedRepoUrl = parseRepoUrl(repoUrl);
    if (!parsedRepoUrl) {
      throw new Error(`Failed to parse Git URL: ${repoUrl}`);
    }
    const repoUrlLink = output.link(repoUrl, repoInfoToUrl(parsedRepoUrl), {
      fallback: () => link(repoUrl),
    });
    output.spinner(
      `Fetching Projects for ${repoUrlLink} under ${chalk.bold(org.slug)}…`
    );
    let projects: Project[] = [];
    const query = new URLSearchParams({ repoUrl });
    const projectsIterator = client.fetchPaginated<{
      projects: Project[];
    }>(`/v9/projects?${query}`);
    const detectedProjects = await detectedProjectsPromise;
    for await (const chunk of projectsIterator) {
      projects = projects.concat(chunk.projects);
      if (chunk.pagination.next) {
        output.spinner(`Found ${chalk.bold(projects.length)} Projects…`, 0);
      }
    }

    if (projects.length === 0) {
      output.log(
        `No Projects are linked to ${repoUrlLink} under ${chalk.bold(
          org.slug
        )}.`
      );
    } else {
      output.log(
        `Found ${pluralize(
          'Project',
          projects.length,
          true
        )} linked to ${repoUrlLink} under ${chalk.bold(org.slug)}`
      );
    }

    // For any projects that already exists on Vercel, remove them from the
    // locally detected directories. Any remaining ones will be prompted to
    // create new Projects for.
    for (const project of projects) {
      detectedProjects.delete(project.rootDirectory ?? '');
    }

    const detectedProjectsCount = Array.from(detectedProjects.values()).reduce(
      (o, f) => o + f.length,
      0
    );
    if (detectedProjectsCount > 0) {
      output.log(
        `Detected ${pluralize(
          'new Project',
          detectedProjectsCount,
          true
        )} that may be created.`
      );
    }

    let selected: (Project | NewProject)[];
    if (yes) {
      selected = projects;
    } else {
      const addSeparators = projects.length > 0 && detectedProjectsCount > 0;
      selected = await client.input.checkbox<Project | NewProject>({
        message: `Which Projects should be ${
          projects.length ? 'linked to' : 'created'
        }?`,
        choices: [
          ...(addSeparators
            ? [new Separator('----- Existing Projects -----')]
            : []),
          ...projects.map(project => {
            return {
              name: `${org.slug}/${project.name}`,
              value: project,
              checked: true,
            };
          }),
          ...(addSeparators
            ? [new Separator('----- New Projects to be created -----')]
            : []),
          ...Array.from(detectedProjects.entries()).flatMap(
            ([rootDirectory, frameworks]) =>
              frameworks.map((framework, i) => {
                const name = slugify(
                  [
                    basename(rootPath),
                    basename(rootDirectory),
                    i > 0 ? framework.slug : '',
                  ]
                    .filter(Boolean)
                    .join('-')
                );
                return {
                  name: `${org.slug}/${name} (${framework.name})`,
                  value: {
                    newProject: true,
                    rootDirectory,
                    name,
                    framework,
                  },
                  // Checked by default when there are no other existing Projects
                  checked: projects.length === 0,
                } as const;
              })
          ),
        ],
      });
    }

    if (selected.length === 0) {
      output.print(`No Projects were selected. Repository not linked.\n`);
      return;
    }

    for (let i = 0; i < selected.length; i++) {
      const selection = selected[i];
      if (!('newProject' in selection && selection.newProject)) continue;
      const orgAndName = `${org.slug}/${selection.name}`;
      output.spinner(`Creating new Project: ${orgAndName}`);
      delete selection.newProject;
      if (!selection.rootDirectory) delete selection.rootDirectory;
      const project = (selected[i] = await createProject(client, {
        ...selection,
        framework: selection.framework.slug,
      }));
      await connectGitProvider(
        client,
        project.id,
        parsedRepoUrl.provider,
        `${parsedRepoUrl.org}/${parsedRepoUrl.repo}`
      );
      output.log(
        `Created new Project: ${output.link(
          orgAndName,
          `https://vercel.com/${orgAndName}`,
          { fallback: false }
        )}`
      );
    }

    repoConfig = {
      orgId: org.id,
      remoteName,
      projects: selected.map(project => {
        if (!('id' in project)) {
          // Shouldn't happen at this point, but just to make TS happy
          throw new TypeError(`Not a Project: ${JSON.stringify(project)}`);
        }
        return {
          id: project.id,
          name: project.name,
          directory: normalize(project.rootDirectory || ''),
        };
      }),
    };
    await outputJSON(repoConfigPath, repoConfig, { spaces: 2 });

    await writeReadme(rootPath);

    // update .gitignore
    const isGitIgnoreUpdated = await addToGitIgnore(rootPath);

    output.print(
      prependEmoji(
        `Linked to ${pluralize(
          'Project',
          selected.length,
          true
        )} under ${chalk.bold(org.slug)} (created ${VERCEL_DIR}${
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
export async function findRepoRoot(
  client: Client,
  start: string
): Promise<string | undefined> {
  const { debug } = output;
  const REPO_JSON_PATH = join(VERCEL_DIR, VERCEL_DIR_REPO);
  /**
   * If the current repo is a git submodule or git worktree '.git' is a file
   * with a pointer to the "parent" git repository instead of a directory.
   */
  const GIT_PATH = isGitWorktreeOrSubmodule({ cwd: client.cwd })
    ? normalize('.git')
    : normalize('.git/config');

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
    let stat = await lstat(repoConfigPath).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    if (stat) {
      debug(`Found "${REPO_JSON_PATH}" - detected "${current}" as repo root`);
      return current;
    }

    // if `.git/config` exists (unlinked),
    // then consider this the repo root
    const gitConfigPath = join(current, GIT_PATH);
    stat = await lstat(gitConfigPath).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    if (stat) {
      debug(`Found "${GIT_PATH}" - detected "${current}" as repo root`);
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
