import chalk from 'chalk';
import pluralize from 'pluralize';
import { homedir } from 'os';
import slugify from '@sindresorhus/slugify';
import { basename, join } from 'path';
import { normalizePath, traverseUpDirectories } from '@vercel/build-utils';
import { lstat, readJSON, outputJSON } from 'fs-extra';
import { VERCEL_DIR, VERCEL_DIR_REPO, writeReadme } from '../projects/link';
import { getRemoteUrls } from '../create-git-meta';
import link from '../output/link';
import { emoji, prependEmoji } from '../emoji';
import selectOrg from '../input/select-org';
import { addToGitIgnore } from './add-to-gitignore';
import type Client from '../client';
import type { Framework } from '@vercel/frameworks';
import type { Org, Project } from '@vercel-internals/types';
import createProject from '../projects/create-project';
import { detectProjects } from '../projects/detect-projects';
import { repoInfoToUrl } from '../git/repo-info-to-url';
import { connectGitProvider, parseRepoUrl } from '../git/connect-git-provider';
import { getGitConfigPath, getGitRootDirectory } from '../git-helpers';
import output from '../../output-manager';
import table from '../output/table';
import {
  formatFrameworkLabel,
  formatFrameworkLabelFromFramework,
} from '../format-framework-label';
import { alignColumnCells } from '../align-column-cells';
import searchProjectAcrossTeams from '../projects/search-project-across-teams';

const home = homedir();

export interface RepoProjectConfig {
  id: string;
  name: string;
  directory: string;
  orgId?: string;
  /**
   * Present only when `true`: the repo link uses the suggested directory locally,
   * but the Vercel project's root directory setting was not updated to match.
   */
  directorySpecifiedManually?: boolean;
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
}

function frameworkToSlug(
  framework: string | Framework | null | undefined
): string {
  if (framework == null) return '';
  if (typeof framework === 'string') return framework;
  return framework.slug ?? '';
}

type FoundProject = {
  project: Project;
  org: Org;
  matchesRootDirectory: boolean;
  matchesFramework: boolean;
  matchesTeam: boolean;
  isLinkedToThisRepo: boolean;
};
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

// const p = {
//   // begin, no-brainer, link them all, don't bother to ask
//   // localRepoJsonProjects: [],
//   // localProjectJsonProjects: [],
//   gitLinkedProjects: [] as { id: string, name: string, directory: string, orgId: string }[],
//   // end
//   // walk through one-by-one of those selected, ask if they want to update their root directory setting. If not, specify 'directory' but with 'directoryIsCwd': true
//   gitLinkedProjectsWithMisconfiguredRootDirectory: [] as { id: string, name: string, directory: string, suggestedDirectory: string, framework: string | null | undefined, orgId: string, matchesFramework: boolean, matchesTeam: boolean, matchesRootDirectory: boolean, isLinkedToThisRepo: boolean }[],
//   // walk through one-by-one of those selected, ask if they want to git link, either way, put them through flow from gitLinkedProjectsWithMisconfiguredRootDirectory, if necessary
//   nonGitLinkedProjects: [] as { id: string, name: string, directory: string, framework: string | null | undefined, orgId: string, matchesFramework: boolean, matchesTeam: boolean, matchesRootDirectory: boolean, isLinkedToThisRepo: boolean }[],
//   // keep existing logic for creating new projects
//   detectedProjects: new Map<string, Framework[]>()
// }

type GitLinkedProject = {
  type: 'gitLinkedProject';
  confirmed?: boolean;
  id: string;
  name: string;
  directory: string;
  orgId: string;
  framework: string | null | undefined;
};
type GitLinkedProjectWithMisconfiguredRootDirectory = {
  type: 'gitLinkedProjectWithMisconfiguredRootDirectory';
  confirmed?: boolean;
  moveDirectory?: string | null;
  connectionOption?: 'connect' | 'link' | 'skip';
  updateDirectoryInProjectSettings?: boolean;
  /** Set when using the suggested directory without updating project settings. */
  directorySpecifiedManually?: boolean;
  id: string;
  name: string;
  directory: string;
  suggestedDirectory: string;
  framework: string | null | undefined;
  orgId: string;
  orgSlug: string;
  matchesFramework: boolean;
  matchesTeam: boolean;
  matchesRootDirectory: boolean;
  isLinkedToThisRepo: boolean;
};
type NonGitLinkedProject = {
  type: 'nonGitLinkedProject';
  id: string;
  confirmed?: boolean;
  moveDirectory?: string | null;
  connectionOption?: 'connect' | 'link' | 'skip';
  updateDirectoryInProjectSettings?: boolean;
  /** Set when using the suggested directory without updating project settings. */
  directorySpecifiedManually?: boolean;
  name: string;
  directory: string;
  suggestedDirectory: string;
  framework: string | null | undefined;
  orgSlug: string;
  orgId: string;
  matchesFramework: boolean;
  matchesTeam: boolean;
  matchesRootDirectory: boolean;
  isLinkedToThisRepo: boolean;
};
type DetectedProject = {
  type: 'detectedProject';
  confirmed?: boolean;
  rootDirectory: string;
  frameworks: Framework[];
};
type Choice = {
  name: string;
  value:
  | GitLinkedProject
  | GitLinkedProjectWithMisconfiguredRootDirectory
  | NonGitLinkedProject
  | DetectedProject;
  checked: boolean;
};

/** Cyan headers for the project-picker table (checkbox + single-option preview). */
const repoLinkSelectionTableHeaders = [
  'Project',
  'Root Directory',
  'Framework',
  'Status',
].map(h => chalk.cyan(chalk.bold(h)));

function repoLinkSummaryTableHeaders(includeActionColumn: boolean): string[] {
  const base = ['Project', 'Root Directory', 'Framework'].map(h =>
    chalk.cyan(chalk.bold(h))
  );
  if (!includeActionColumn) {
    return base;
  }
  return [...base, chalk.cyan(chalk.bold('Action'))];
}

/** Compact summary for the checkbox "answered" line (Inquirer joins full row labels by default). */
function formatRepoLinkCheckboxSelectionSummary(
  repoRoot: string,
  selectedChoices: ReadonlyArray<{ value: Choice['value'] }>
): string {
  const labels = selectedChoices.map(({ value: v }) => {
    if (v.type === 'detectedProject') {
      const base =
        basename(v.rootDirectory === '.' ? '' : v.rootDirectory) ||
        basename(repoRoot);
      return slugify(base);
    }
    return v.name;
  });
  const joined = labels.join(', ');
  if (joined.length <= 72) {
    return joined;
  }
  return `${selectedChoices.length} projects selected`;
}

function linkRepoApplyConfirmMessage(selectionCount: number): string {
  return selectionCount === 1
    ? 'Link the project above?'
    : 'Link the projects above?';
}

function directoryForRepoJsonFromNormalizedPath(normalizedDir: string): string {
  return normalizedDir === '' ? '.' : normalizePath(normalizedDir);
}

function canonicalDirectoryForSetup(
  sel: NonGitLinkedProject | GitLinkedProjectWithMisconfiguredRootDirectory
): string {
  if (sel.moveDirectory != null) {
    return normalizeRootDirectoryPath(sel.moveDirectory);
  }
  return normalizeRootDirectoryPath(sel.directory);
}

async function patchProjectRootDirectory(
  client: Client,
  projectId: string,
  dirNorm: string
): Promise<void> {
  await client.fetch<Project>(
    `/v9/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: { rootDirectory: dirNorm === '' ? null : dirNorm },
    }
  );
}

async function applyRepoLinkSelections(
  client: Client,
  org: Org,
  rootPath: string,
  parsedRepoUrl: NonNullable<ReturnType<typeof parseRepoUrl>>,
  selections: Choice['value'][],
  { yes }: { yes: boolean }
): Promise<RepoProjectConfig[]> {
  const repoProjects: RepoProjectConfig[] = [];
  const gitRepoPath = `${parsedRepoUrl.org}/${parsedRepoUrl.repo}`;

  for (const sel of selections) {
    switch (sel.type) {
      case 'gitLinkedProject': {
        repoProjects.push({
          id: sel.id,
          name: sel.name,
          directory: directoryForRepoJsonFromNormalizedPath(
            normalizeRootDirectoryPath(sel.directory)
          ),
          orgId: sel.orgId,
        });
        break;
      }
      case 'detectedProject': {
        if (yes) {
          break;
        }
        for (let i = 0; i < sel.frameworks.length; i++) {
          const framework = sel.frameworks[i];
          const name = slugify(
            [
              basename(sel.rootDirectory === '.' ? '' : sel.rootDirectory) ||
              basename(rootPath),
              i > 0 ? framework.slug : '',
            ]
              .filter(Boolean)
              .join('-')
          );
          const orgAndName = `${org.slug}/${name}`;
          output.spinner(`Creating new Project: ${orgAndName}`);
          const project = await createProject(client, {
            name,
            ...(sel.rootDirectory ? { rootDirectory: sel.rootDirectory } : {}),
            framework: frameworkToSlug(framework),
          });
          await connectGitProvider(
            client,
            project.id,
            parsedRepoUrl.provider,
            gitRepoPath
          );
          output.print(
            `Created new Project: ${output.link(
              orgAndName,
              `https://vercel.com/${orgAndName}`,
              { fallback: false }
            )}\n`
          );
          repoProjects.push({
            id: project.id,
            name: project.name,
            directory: directoryForRepoJsonFromNormalizedPath(
              normalizeRootDirectoryPath(project.rootDirectory ?? '')
            ),
            orgId: org.id,
          });
        }
        break;
      }
      case 'nonGitLinkedProject':
      case 'gitLinkedProjectWithMisconfiguredRootDirectory': {
        const dirNorm = canonicalDirectoryForSetup(sel);
        if (!yes && sel.updateDirectoryInProjectSettings) {
          output.spinner(`Updating project settings for ${sel.name}…`);
          await patchProjectRootDirectory(client, sel.id, dirNorm);
        }
        if (!yes && sel.connectionOption === 'connect') {
          output.spinner(`Connecting Git repository to ${sel.name}…`);
          await connectGitProvider(
            client,
            sel.id,
            parsedRepoUrl.provider,
            gitRepoPath
          );
        }
        const row: RepoProjectConfig = {
          id: sel.id,
          name: sel.name,
          directory: directoryForRepoJsonFromNormalizedPath(dirNorm),
          orgId: sel.orgId,
        };
        if (sel.directorySpecifiedManually) {
          row.directorySpecifiedManually = true;
        }
        repoProjects.push(row);
        break;
      }
      default: {
        const _exhaustive: never = sel;
        void _exhaustive;
      }
    }
  }

  return repoProjects;
}

/**
 * Runs the project discovery flow: selects org, discovers/creates projects,
 * and returns the selected projects as `RepoProjectConfig[]`.
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
  {
    yes,
    existingProjectIds,
    existingDirectories,
    existingRemoteName,
  }: {
    yes: boolean;
    existingProjectIds?: Set<string>;
    existingDirectories?: Set<string>;
    /** When set, skip the remote selection prompt and use this remote. */
    existingRemoteName?: string;
  }
): Promise<
  | { remoteName: string; projects: RepoProjectConfig[]; orgSlug: string }
  | undefined
> {
  // Detect the projects on the filesystem out of band, so that
  // they will be ready by the time the projects are listed
  const detectedProjectsPromise = detectProjects(rootPath).catch(err => {
    output.debug(`Failed to detect local projects: ${err}`);
    return new Map<string, Framework[]>();
  });

  const p = {
    // begin, no-brainer, link them all, don't bother to ask
    // localRepoJsonProjects: [],
    // localProjectJsonProjects: [],
    gitLinkedProjects: [] as GitLinkedProject[],
    // end
    // walk through one-by-one of those selected, ask if they want to update their root directory setting. If not, specify 'directory' but with 'directoryIsCwd': true
    gitLinkedProjectsWithMisconfiguredRootDirectory:
      [] as GitLinkedProjectWithMisconfiguredRootDirectory[],
    // walk through one-by-one of those selected, ask if they want to git link, either way, put them through flow from gitLinkedProjectsWithMisconfiguredRootDirectory, if necessary
    nonGitLinkedProjects: [] as NonGitLinkedProject[],
    // keep existing logic for creating new projects
    detectedProjects: new Map<string, Framework[]>(),
  };

  const org = await selectOrg(
    client,
    'Which scope should contain your Project(s)?',
    yes
  );
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  // Use getGitConfigPath to correctly resolve the config path for
  // regular repos, worktrees, and submodules. Falls back to the
  // traditional path if git commands fail.
  const gitConfigPath =
    getGitConfigPath({ cwd: rootPath }) ?? join(rootPath, '.git/config');
  const remoteUrls = await getRemoteUrls(gitConfigPath);
  if (!remoteUrls) {
    throw new Error('Could not determine Git remote URLs');
  }

  let remoteName: string;
  if (existingRemoteName) {
    // Re-use the remote from the existing repo.json
    remoteName = existingRemoteName;
    if (!remoteUrls[remoteName]) {
      throw new Error(
        `Git remote "${remoteName}" from repo.json no longer exists`
      );
    }
  } else {
    const remoteNames = Object.keys(remoteUrls).sort();
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
  }
  const repoUrl = remoteUrls[remoteName];
  const parsedRepoUrl = parseRepoUrl(repoUrl);
  if (!parsedRepoUrl) {
    throw new Error(`Failed to parse Git URL: ${repoUrl}`);
  }
  const repoUrlLink = output.link(repoUrl, repoInfoToUrl(parsedRepoUrl), {
    fallback: () => link(repoUrl),
  });
  const detectedProjects = await detectedProjectsPromise;

  const linkDemoId = process.env.LINK_DEMO?.trim();
  let projects: Project[] = [];

  if (linkDemoId) {
    output.print(
      `${chalk.yellow(
        `LINK_DEMO=${linkDemoId} — loading fixture (skipping project API & search)`
      )}\n`
    );
    const { applyLinkDemoScenario } = await import('./link-demo-scenarios');
    applyLinkDemoScenario(linkDemoId, org, p, detectedProjects);
  } else {
    output.spinner(
      `Fetching Projects for ${repoUrlLink} under ${chalk.bold(org.slug)}…`
    );
    const query = new URLSearchParams({ repoUrl });
    // TODO: we may remove the team scope from this flow, if so, this will expand
    const projectsIterator = client.fetchPaginated<{
      projects: Project[];
    }>(`/v9/projects?${query}`);
    for await (const chunk of projectsIterator) {
      projects = projects.concat(chunk.projects);
      if (chunk.pagination.next) {
        output.spinner(`Found ${chalk.bold(projects.length)} Projects…`, 0);
      }
    }

    // Filter out projects that are already linked in repo.json (by ID or directory)
    if (existingProjectIds || existingDirectories) {
      projects = projects.filter(p => {
        if (existingProjectIds?.has(p.id)) return false;
        if (existingDirectories?.has(normalizePath(p.rootDirectory || '.')))
          return false;
        return true;
      });
    }

    // For any projects that already exists on Vercel, remove them from the
    // locally detected directories. Any remaining ones will be prompted to
    // create new Projects for.
    for (const project of projects) {
      detectedProjects.delete(project.rootDirectory ?? '');
    }
    // Also remove detected projects whose directories are already linked
    // in the existing repo.json (e.g. linked to a different org).
    // detectProjects() uses '' for root, while repo.json uses '.', so normalize.
    if (existingDirectories) {
      for (const dir of existingDirectories) {
        detectedProjects.delete(dir === '.' ? '' : dir);
      }
    }

    // look for non-git projects matching cwd

    const cwdFolder = basename(client.cwd);

    const nonGitLinkedProjects = new Map<string, FoundProject[]>();
    const gitLinkedProjectsWithMisconfiguredRootDirectory = new Map<
      string,
      FoundProject[]
    >();
    for (const [rootDirectory, frameworks] of detectedProjects) {
      const folderName =
        normalizeRootDirectoryPath(rootDirectory) === ''
          ? cwdFolder
          : rootDirectory.split('/').pop();
      if (!folderName) continue;
      const matches = await searchProjectAcrossTeams(client, folderName);
      const foundProjectCandidates: FoundProject[] = [];
      const foundProjectCandidatesWithMisconfiguredRootDirectory: FoundProject[] =
        [];
      for (const match of matches) {
        const isLinkedToThisRepo = isLinkedToRepo(match.project, parsedRepoUrl);
        if (isLinkedToThisRepo) {
          // TODO: we may remove the team scope from this flow, if so, this will expand
          if (match.project.accountId === org.id) {
            projects = projects.filter(
              project => project.id !== match.project.id
            );
            detectedProjects.delete(rootDirectory);
            p.gitLinkedProjectsWithMisconfiguredRootDirectory.push({
              type: 'gitLinkedProjectWithMisconfiguredRootDirectory',
              id: match.project.id,
              name: match.project.name,
              directory: normalizeRootDirectoryPath(
                match.project.rootDirectory
              ),
              suggestedDirectory: normalizeRootDirectoryPath(rootDirectory),
              framework: match.project.framework,
              orgId: match.org.id,
              orgSlug: match.org.slug,
              matchesFramework: frameworks.some(
                framework => framework.slug === match.project.framework
              ),
              matchesTeam: match.org.id === org.id,
              matchesRootDirectory:
                normalizeRootDirectoryPath(match.project.rootDirectory) ===
                normalizeRootDirectoryPath(rootDirectory),
              isLinkedToThisRepo,
            });
            foundProjectCandidatesWithMisconfiguredRootDirectory.push({
              ...match,
              matchesFramework: frameworks.some(
                framework => framework.slug === match.project.framework
              ),
              matchesTeam: match.org.id === org.id,
              matchesRootDirectory:
                normalizeRootDirectoryPath(match.project.rootDirectory) ===
                normalizeRootDirectoryPath(rootDirectory),
              isLinkedToThisRepo,
            });
          }
        } else {
          detectedProjects.delete(rootDirectory);
          p.nonGitLinkedProjects.push({
            type: 'nonGitLinkedProject',
            id: match.project.id,
            name: match.project.name,
            directory: normalizeRootDirectoryPath(match.project.rootDirectory),
            suggestedDirectory: normalizeRootDirectoryPath(rootDirectory),
            framework: match.project.framework,
            orgId: match.org.id,
            orgSlug: match.org.slug,
            matchesFramework: frameworks.some(
              framework => framework.slug === match.project.framework
            ),
            matchesTeam: match.org.id === org.id,
            matchesRootDirectory:
              normalizeRootDirectoryPath(match.project.rootDirectory) ===
              normalizeRootDirectoryPath(rootDirectory),
            isLinkedToThisRepo,
          });
          foundProjectCandidates.push({
            ...match,
            matchesFramework: frameworks.some(
              framework => framework.slug === match.project.framework
            ),
            matchesTeam: match.org.id === org.id,
            matchesRootDirectory:
              normalizeRootDirectoryPath(match.project.rootDirectory) ===
              normalizeRootDirectoryPath(rootDirectory),
            isLinkedToThisRepo,
          });
        }
      }
      if (foundProjectCandidates.length > 0) {
        nonGitLinkedProjects.set(folderName, foundProjectCandidates);
      }
      if (foundProjectCandidatesWithMisconfiguredRootDirectory.length > 0) {
        gitLinkedProjectsWithMisconfiguredRootDirectory.set(
          folderName,
          foundProjectCandidatesWithMisconfiguredRootDirectory
        );
      }
    }

    if (projects.length > 0) {
      for (const project of projects) {
        p.gitLinkedProjects.push({
          type: 'gitLinkedProject',
          id: project.id,
          name: project.name,
          directory: normalizeRootDirectoryPath(project.rootDirectory),
          orgId: project.accountId,
          framework: project.framework,
        });
      }
    }
  }
  // console.log(projects.map(project => ({ name: project.name, rootDirectory: project.rootDirectory, framework: project.framework })))
  // console.log({ nonGitLinkedProjects })
  // console.log({ gitLinkedProjectsWithMisconfiguredRootDirectory })
  // console.log({ detectedProjects })

  // await Promise.all(foldersForDetectedProjects.map(async folder => {
  //   // TODO: we may remove the team scope from this flow, if so, this will expand
  //   const matches = await searchProjectAcrossTeams(client, folder);
  //   const project = matches.map(match => {
  //     // filter out projects that are already linked to another repo
  //     if (match.project.link) {
  //       return null
  //     }

  //     return match.org.id === org.id ? match.project : null
  //   }
  //   ).filter(Boolean) as Project[]
  //   if (project) {
  //     foundProjects.set(folder === cwdFolder ? '' : folder, project);
  //   }
  //   return true
  // }));

  // if (foundProjects.size > 0) {
  //   for (const dir of foundProjects.keys()) {
  //     detectedProjects.delete(dir === '.' ? '' : dir);
  //   }
  // }

  // const detectedExistingProjectsCount = Array.from(foundProjects.values()).reduce(
  //   (o, f) => o + f.length,
  //   0
  // );
  // if (detectedExistingProjectsCount > 0) {
  //   output.log(
  //     `Detected ${pluralize(
  //       'existingProject',
  //       detectedExistingProjectsCount,
  //       true
  //     )} that may be linked to this repository.`
  //   );
  // }

  p.detectedProjects = detectedProjects;
  // output.log(
  //   `Auto - linking ${
  // pluralize(
  // //     'Project',
  // //     p.gitLinkedProjects.length,
  // //     true
  // //   )} linked to ${repoUrlLink} under ${chalk.bold(org.slug)}`
  // );
  type CheckboxRowSpec = {
    cells: string[];
    value: Choice['value'];
    checked: boolean;
  };

  const gitLinkedCheckboxSpecs: CheckboxRowSpec[] = p.gitLinkedProjects.map(
    project => ({
      cells: [
        chalk.bold(project.name),
        chalk.dim(formatRootForDisplay(project.directory)),
        formatFrameworkLabel(project.framework),
        chalk.dim('Linked to repo'),
      ],
      value: project,
      checked: true,
    })
  );

  const misconfiguredCheckboxSpecs: CheckboxRowSpec[] =
    p.gitLinkedProjectsWithMisconfiguredRootDirectory.map(project => ({
      cells: [
        chalk.bold(project.name),
        chalk.dim('—'),
        formatFrameworkLabel(project.framework),
        chalk.yellow('Needs details'),
      ],
      value: project,
      checked: true,
    }));

  const nonGitCheckboxSpecs: CheckboxRowSpec[] = p.nonGitLinkedProjects.map(
    project => ({
      cells: [
        chalk.bold(project.name),
        chalk.dim(formatRootForDisplay(project.directory)),
        formatFrameworkLabel(project.framework),
        chalk.yellow('Not linked to this repository'),
      ],
      value: project,
      checked: true,
    })
  );

  const detectedCheckboxSpecs: CheckboxRowSpec[] = Array.from(
    p.detectedProjects.entries()
  ).flatMap(([rootDirectory, frameworks]) =>
    frameworks.map((framework, i) => {
      const slugName = slugify(
        [
          basename(rootDirectory) || basename(rootPath),
          i > 0 ? (framework.slug ?? '') : '',
        ]
          .filter(Boolean)
          .join('-')
      );
      return {
        cells: [
          chalk.bold(slugName),
          chalk.dim(formatRootForDisplay(rootDirectory)),
          formatFrameworkLabelFromFramework(framework),
          chalk.bold(chalk.yellow('New project')),
        ],
        value: {
          type: 'detectedProject' as const,
          rootDirectory,
          frameworks: [framework],
        },
        checked: false,
      };
    })
  );

  const primaryCheckboxSpecs: CheckboxRowSpec[] = [
    ...gitLinkedCheckboxSpecs,
    ...misconfiguredCheckboxSpecs,
    ...nonGitCheckboxSpecs,
  ];

  const allInteractiveSpecs: CheckboxRowSpec[] = [
    ...primaryCheckboxSpecs,
    ...detectedCheckboxSpecs,
  ];

  output.stopSpinner();

  let selected2: Choice['value'][];

  if (allInteractiveSpecs.length === 0) {
    selected2 = [];
  } else if (allInteractiveSpecs.length === 1) {
    const sole = allInteractiveSpecs[0];
    const soleNeedsSetupPhase =
      sole.value.type === 'nonGitLinkedProject' ||
      sole.value.type === 'gitLinkedProjectWithMisconfiguredRootDirectory';
    output.print(
      `\n${table([repoLinkSelectionTableHeaders, sole.cells], {
        align: ['l', 'l', 'l', 'l'],
        hsep: 2,
      })}\n`
    );
    if (yes) {
      if (sole.value.type === 'detectedProject') {
        output.print(
          `\n${chalk.yellow(
            'Non-interactive mode (--yes) cannot create new Vercel projects.'
          )}\n`
        );
        return;
      }
      selected2 = [sole.value];
    } else if (!soleNeedsSetupPhase) {
      const linkThis = await client.input.confirm(
        linkRepoApplyConfirmMessage(1),
        true
      );
      selected2 = linkThis ? [sole.value] : [];
    } else {
      const include = await client.input.confirm(
        'Include this project in the repository link?',
        true
      );
      selected2 = include ? [sole.value] : [];
    }
  } else {
    const dataRowsForAlign = [
      ...primaryCheckboxSpecs.map(r => r.cells),
      ...detectedCheckboxSpecs.map(r => r.cells),
    ];
    const alignedBlock = alignColumnCells([
      repoLinkSelectionTableHeaders,
      ...dataRowsForAlign,
    ]);
    const alignedSelectionHeaderLine = alignedBlock[0];
    const alignedPrimaryLines = alignedBlock.slice(
      1,
      1 + primaryCheckboxSpecs.length
    );
    const alignedDetectedLines = alignedBlock.slice(
      1 + primaryCheckboxSpecs.length
    );

    output.print(`\n${alignedSelectionHeaderLine}\n`);

    const choices: Choice[] = [];
    primaryCheckboxSpecs.forEach((spec, i) => {
      choices.push({
        name: alignedPrimaryLines[i],
        value: spec.value,
        checked: spec.checked,
      });
    });
    detectedCheckboxSpecs.forEach((spec, i) => {
      choices.push({
        name: alignedDetectedLines[i],
        value: spec.value,
        checked: spec.checked,
      });
    });

    if (yes) {
      selected2 = primaryCheckboxSpecs.map(spec => spec.value);
      if (selected2.length === 0 && detectedCheckboxSpecs.length > 0) {
        output.print(
          `\n${chalk.yellow(
            'Non-interactive mode (--yes) cannot create new Vercel projects, and no existing projects were available to link.'
          )}\n`
        );
        return;
      }
    } else {
      selected2 = await client.input.checkbox<Choice['value']>({
        message: 'Select projects to link',
        choices,
        theme: {
          style: {
            renderSelectedChoices: (
              selectedChoices: ReadonlyArray<{ value: Choice['value'] }>
            ) =>
              formatRepoLinkCheckboxSelectionSummary(
                rootPath,
                selectedChoices
              ),
          },
        },
      });
    }
  }
  const setupPhases = selected2.filter(
    (
      c
    ): c is
      | NonGitLinkedProject
      | GitLinkedProjectWithMisconfiguredRootDirectory =>
      c.type === 'nonGitLinkedProject' ||
      c.type === 'gitLinkedProjectWithMisconfiguredRootDirectory'
  );

  for (let i = 0; i < setupPhases.length; i++) {
    const choice = setupPhases[i];
    if (setupPhases.length > 1) {
      output.print(
        `${chalk.dim(`Project details · ${i + 1} of ${setupPhases.length}`)}\n`
      );
    }
    if (yes) {
      applyDefaultNonInteractiveProjectSetup(choice);
    } else {
      await getProjectSetupInfo(client, choice);
    }
  }

  if (yes) {
    selected2 = selected2.filter(s => s.type !== 'detectedProject');
  }

  if (selected2.length === 0) {
    output.print(`\n${chalk.yellow('No projects selected.')}\n`);
    return;
  }

  /** One row, no setup prompts — preview table already matched; skip duplicate summary + confirm. */
  const skipFinalSummaryAndConfirm =
    selected2.length === 1 && setupPhases.length === 0;

  if (!skipFinalSummaryAndConfirm) {
    const hadLinkPlan = printLinkSelectionSummary({
      rootPath,
      selections: selected2,
    });

    if (!hadLinkPlan) {
      return;
    }

    output.print('\n');
    const proceedWithPlan =
      yes ||
      (await client.input.confirm(
        linkRepoApplyConfirmMessage(selected2.length),
        true
      ));
    if (!proceedWithPlan) {
      output.print(`Canceled. Repository not linked.\n`);
      return;
    }
  }

  if (linkDemoId) {
    output.print(
      `\n${chalk.yellow(
        'LINK_DEMO — demo complete; exiting without creating projects, updating settings, or writing repo.json.'
      )}\n`
    );
    output.print(JSON.stringify(selected2, null, 2));
    return;
  }

  const repoProjects = await applyRepoLinkSelections(
    client,
    org,
    rootPath,
    parsedRepoUrl,
    selected2,
    { yes }
  );

  return { remoteName, projects: repoProjects, orgSlug: org.slug };
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
    const result = await discoverRepoProjects(client, rootPath, {
      yes,
    });
    if (!result) {
      return;
    }

    repoConfig = {
      remoteName: result.remoteName,
      projects: result.projects,
    };
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
        )} under ${chalk.bold(result.orgSlug)} (created ${VERCEL_DIR}${isGitIgnoreUpdated ? ' and added it to .gitignore' : ''
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
 * Given "", ".", "./", null, undefined, return ""
 */
function normalizeRootDirectoryPath(path: string | null | undefined): string {
  if (!path) return '';
  if (path === '.') return '';
  if (path === './') return '';
  return path.replace(/\\/g, '/');
}

function formatRootForDisplay(dir: string): string {
  const n = normalizeRootDirectoryPath(dir);
  return n === '' ? '.' : n;
}

function formatRootDirectoryCell(
  fromDisplay: string,
  toDisplay: string,
  options: {
    isMoving: boolean;
  }
): string {
  if (options.isMoving) {
    return `${chalk.dim(fromDisplay)} ${chalk.dim('->')} ${chalk.hex('#FFB300')(toDisplay)}`;
  }
  return fromDisplay;
}

function rootCellForProjectWithDirectoryOptions(
  sel: NonGitLinkedProject | GitLinkedProjectWithMisconfiguredRootDirectory
): string {
  const fromDisplay = formatRootForDisplay(sel.directory);
  const toDisplay =
    sel.moveDirectory != null
      ? formatRootForDisplay(sel.moveDirectory)
      : fromDisplay;
  const isMoving =
    sel.moveDirectory != null &&
    normalizeRootDirectoryPath(sel.moveDirectory) !==
    normalizeRootDirectoryPath(sel.directory);
  return formatRootDirectoryCell(fromDisplay, toDisplay, {
    isMoving,
  });
}

/** Planned repo-link actions after setup prompts (summary table only). */
function linkPlanActionCell(
  sel:
    | GitLinkedProject
    | GitLinkedProjectWithMisconfiguredRootDirectory
    | NonGitLinkedProject
    | DetectedProject
): string {
  if (sel.type === 'gitLinkedProject' || sel.type === 'detectedProject') {
    return chalk.dim('—');
  }
  const willConnectGit = sel.connectionOption === 'connect';
  const willUpdateProjectSettings = Boolean(sel.updateDirectoryInProjectSettings);
  if (willConnectGit) {
    return chalk.dim('Connect Git repo');
  }
  if (willUpdateProjectSettings) {
    return chalk.dim('Update project settings');
  }
  return chalk.dim('—');
}

/** True when the summary would show a non-placeholder value in the Action column. */
function selectionHasNonemptyLinkPlanAction(
  sel:
    | GitLinkedProject
    | GitLinkedProjectWithMisconfiguredRootDirectory
    | NonGitLinkedProject
    | DetectedProject
): boolean {
  if (sel.type === 'gitLinkedProject' || sel.type === 'detectedProject') {
    return false;
  }
  return (
    sel.connectionOption === 'connect' ||
    Boolean(sel.updateDirectoryInProjectSettings)
  );
}

function linkSelectionTableRow(
  sel:
    | GitLinkedProject
    | GitLinkedProjectWithMisconfiguredRootDirectory
    | NonGitLinkedProject
    | DetectedProject,
  rootPath: string,
  includeActionColumn: boolean
): string[] {
  const maybeAction = (cells: string[]): string[] =>
    includeActionColumn ? [...cells, linkPlanActionCell(sel)] : cells;

  switch (sel.type) {
    case 'gitLinkedProject':
      return maybeAction([
        chalk.bold(sel.name),
        formatRootForDisplay(sel.directory),
        formatFrameworkLabel(sel.framework),
      ]);
    case 'nonGitLinkedProject':
      return maybeAction([
        chalk.bold(sel.name),
        rootCellForProjectWithDirectoryOptions(sel),
        formatFrameworkLabel(sel.framework),
      ]);
    case 'gitLinkedProjectWithMisconfiguredRootDirectory':
      return maybeAction([
        chalk.bold(sel.name),
        rootCellForProjectWithDirectoryOptions(sel),
        formatFrameworkLabel(sel.framework),
      ]);
    case 'detectedProject': {
      if (sel.frameworks.length === 0) {
        return maybeAction([
          chalk.dim('—'),
          formatRootForDisplay(sel.rootDirectory),
          chalk.dim('—'),
        ]);
      }
      const proposedNames = sel.frameworks.map((framework, i) =>
        slugify(
          [
            basename(sel.rootDirectory) || basename(rootPath),
            i > 0 ? framework.slug : '',
          ]
            .filter(Boolean)
            .join('-')
        )
      );
      return maybeAction([
        chalk.bold(proposedNames.join(', ')),
        formatRootForDisplay(sel.rootDirectory),
        sel.frameworks.map(f => formatFrameworkLabelFromFramework(f)).join(', '),
      ]);
    }
    default: {
      const _exhaustive: never = sel;
      void _exhaustive;
      const dash = chalk.dim('—');
      return includeActionColumn
        ? [dash, dash, dash, dash]
        : [dash, dash, dash];
    }
  }
}

/**
 * Non-interactive (`--yes`): write `repo.json` mappings only — no new projects,
 * no PATCH to project settings, no Git connect. When Vercel root and suggested
 * directory differ, use the suggested directory in `repo.json` with
 * `directorySpecifiedManually: true`.
 */
function applyDefaultNonInteractiveProjectSetup(
  project: NonGitLinkedProject | GitLinkedProjectWithMisconfiguredRootDirectory
): void {
  project.confirmed = true;
  project.connectionOption = 'link';
  project.updateDirectoryInProjectSettings = false;
  delete project.directorySpecifiedManually;
  if (
    normalizeRootDirectoryPath(project.directory) !==
    normalizeRootDirectoryPath(project.suggestedDirectory)
  ) {
    project.moveDirectory = project.suggestedDirectory;
    project.directorySpecifiedManually = true;
  } else {
    project.moveDirectory = null;
  }
}

/**
 * Prints the selected-projects summary table. Returns whether any rows were shown (caller may confirm next).
 */
function printLinkSelectionSummary(options: {
  rootPath: string;
  selections: (
    | GitLinkedProject
    | GitLinkedProjectWithMisconfiguredRootDirectory
    | NonGitLinkedProject
    | DetectedProject
  )[];
}): boolean {
  const { rootPath, selections } = options;

  if (selections.length === 0) {
    output.print(`\n${chalk.yellow('No projects selected.')}\n`);
    return false;
  }

  const includeActionColumn = selections.some(selectionHasNonemptyLinkPlanAction);
  const rows = selections.map(sel =>
    linkSelectionTableRow(sel, rootPath, includeActionColumn)
  );
  const align = includeActionColumn
    ? (['l', 'l', 'l', 'l'] as const)
    : (['l', 'l', 'l'] as const);

  output.print(
    `\n${table([repoLinkSummaryTableHeaders(includeActionColumn), ...rows], {
      align: [...align],
      hsep: 2,
    })}\n`
  );
  return true;
}

async function getProjectSetupInfo(
  client: Client,
  project: NonGitLinkedProject | GitLinkedProjectWithMisconfiguredRootDirectory
) {
  output.stopSpinner();
  let directory: string | null = null;
  let updateDirectoryInProjectSettings: boolean = false;
  let connectionOption: 'connect' | 'link' | 'skip' =
    project.type === 'nonGitLinkedProject' ? 'connect' : 'link';

  if (project.type === 'nonGitLinkedProject') {
    connectionOption = await client.input.select({
      message: `${chalk.blue(chalk.bold(project.name))} is not linked to this repository`,
      default: 'connect',
      choices: [
        {
          name: 'Link and connect this Git repository to this project',
          value: 'connect',
        },
        { name: 'Link this project only', value: 'link' },
      ],
    });
  }
  if (
    normalizeRootDirectoryPath(project.directory) !==
    normalizeRootDirectoryPath(project.suggestedDirectory)
  ) {
    const moveOption = await client.input.select({
      message: `${chalk.blue(chalk.bold(project.name))}: the root directory is "${chalk.gray(normalizeRootDirectoryPath(project.directory) === '' ? '.' : normalizeRootDirectoryPath(project.directory))}", but the suggested directory is "${chalk.gray(normalizeRootDirectoryPath(project.suggestedDirectory))}".`,
      default: 'yes',
      choices: [
        { name: 'Yes', value: 'yes' },
        { name: 'No', value: 'no' },
        {
          name: 'Choose a different directory',
          value: 'choose-different-directory',
        },
      ],
    });
    if (moveOption === 'yes') {
      directory = project.suggestedDirectory;
      updateDirectoryInProjectSettings = await client.input.confirm(
        `Would you like to update the root directory in the project settings to "${chalk.gray(formatRootForDisplay(project.suggestedDirectory))}"?`,
        true
      );
      if (!updateDirectoryInProjectSettings) {
        project.directorySpecifiedManually = true;
      }
    } else if (moveOption === 'no') {
      directory = project.directory;
    } else if (moveOption === 'choose-different-directory') {
      directory = await client.input.text({
        message: 'Enter the new directory',
      });
      updateDirectoryInProjectSettings = await client.input.confirm(
        `Would you like to update the root directory in the project settings to "${chalk.gray(formatRootForDisplay(directory))}"?`,
        true
      );
    }
  }
  project.confirmed = true;
  project.connectionOption = connectionOption;
  project.updateDirectoryInProjectSettings = updateDirectoryInProjectSettings;
  project.moveDirectory = directory ?? null;
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
        normalizedPath.startsWith(`${project.directory} / `)
      );
    });
  // If there are multiple matches, we only want the most relevant
  // selections (with the deepest directory depth), so pick the first
  // one and filter on those matches.
  const firstMatch = matches[0];
  return matches.filter(match => match.directory === firstMatch.directory);
}

const isLinkedToRepo = (
  project: Project,
  repoInfo: ReturnType<typeof parseRepoUrl>
): boolean => {
  if (!repoInfo) return false;
  if (
    project.link?.repo === repoInfo.repo &&
    project.link?.org === repoInfo.org
  ) {
    return true;
  }
  return false;
};
