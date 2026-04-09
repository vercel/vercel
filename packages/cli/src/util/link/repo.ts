import chalk from 'chalk';
import { Separator } from '@inquirer/checkbox';
import pluralize from 'pluralize';
import { homedir } from 'os';
import slugify from '@sindresorhus/slugify';
import { basename, join } from 'path';
import { normalizePath, traverseUpDirectories } from '@vercel/build-utils';
import { lstat, readJSON, outputJSON } from 'fs-extra';
import toHumanPath from '../humanize-path';
import {
  linkFolderToProject,
  VERCEL_DIR,
  VERCEL_DIR_REPO,
  writeReadme,
} from '../projects/link';
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
  skipSetupConfirm?: boolean;
}

interface NewProject {
  newProject?: true;
  rootDirectory?: string;
  name: string;
  framework: Framework;
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
    skipSetupConfirm,
  }: {
    yes: boolean;
    existingProjectIds?: Set<string>;
    existingDirectories?: Set<string>;
    /** When set, skip the remote selection prompt and use this remote. */
    existingRemoteName?: string;
    /** When true, skip the setup confirmation prompt */
    skipSetupConfirm?: boolean;
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

  const promptAction = existingRemoteName ? 'add' : 'link';
  const confirmMessage =
    promptAction === 'add'
      ? `Add Project(s) for Git repository at ${chalk.cyan(
        `"${toHumanPath(rootPath)}"`
      )}?`
      : `Link Git repository at ${chalk.cyan(
        `"${toHumanPath(rootPath)}"`
      )} to your Project(s)?`;

  const shouldLink = skipSetupConfirm
    ? true
    : yes || (await client.input.confirm(confirmMessage, true));

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
    output.log(
      chalk.yellow(
        `LINK_DEMO=${linkDemoId} — loading fixture (skipping project API & search)`
      )
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

  if (
    p.gitLinkedProjectsWithMisconfiguredRootDirectory.length === 0 &&
    p.gitLinkedProjectsWithMisconfiguredRootDirectory.length === 0 &&
    p.nonGitLinkedProjects.length === 1
  ) {
    await getProjectSetupInfo(client, p.nonGitLinkedProjects[0]);
  }

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

  const gitLinkedCheckboxSpecs: CheckboxRowSpec[] =
    p.gitLinkedProjects.map(project => ({
      cells: [
        chalk.bold(`${org.slug}/${project.name}`),
        chalk.dim(formatRootForDisplay(project.directory)),
        formatFrameworkLabel(project.framework),
        chalk.dim('Linked to repo'),
      ],
      value: project,
      checked: true,
    }));

  const misconfiguredCheckboxSpecs: CheckboxRowSpec[] =
    p.gitLinkedProjectsWithMisconfiguredRootDirectory.map(project => ({
      cells: [
        chalk.bold(`${org.slug}/${project.name}`),
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
        chalk.bold(`${org.slug}/${project.name}`),
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
          i > 0 ? framework.slug ?? '' : '',
        ]
          .filter(Boolean)
          .join('-')
      );
      return {
        cells: [
          chalk.bold(`${org.slug}/${slugName}`),
          chalk.dim(formatRootForDisplay(rootDirectory)),
          formatFrameworkLabelFromFramework(framework),
          chalk.dim('New project'),
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

  const alignedPrimaryLines = alignColumnCells(
    primaryCheckboxSpecs.map(r => r.cells),
    3
  );
  const alignedDetectedLines = alignColumnCells(
    detectedCheckboxSpecs.map(r => r.cells),
    3
  );

  const choices: (Separator | Choice)[] = [];
  primaryCheckboxSpecs.forEach((spec, i) => {
    choices.push({
      name: alignedPrimaryLines[i],
      value: spec.value,
      checked: spec.checked,
    });
  });
  if (detectedCheckboxSpecs.length > 0 && primaryCheckboxSpecs.length > 0) {
    choices.push(
      new Separator(
        chalk.dim(
          '  ─────────────────────  New projects to create  ─────────────────────'
        )
      )
    );
  }
  detectedCheckboxSpecs.forEach((spec, i) => {
    choices.push({
      name: alignedDetectedLines[i],
      value: spec.value,
      checked: spec.checked,
    });
  });

  output.stopSpinner();
  const selected2 = await client.input.checkbox<Choice['value']>({
    message: 'Select projects to link',
    choices,
  });
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
      if (i > 0) {
        output.log('');
      }
      output.log(
        chalk.dim(
          `Project details · ${i + 1} of ${setupPhases.length}`
        )
      );
    }
    await getProjectSetupInfo(client, choice);
  }
  const hadLinkPlan = printLinkSelectionSummary({
    orgSlug: org.slug,
    rootPath,
    selections: selected2,
  });

  if (!hadLinkPlan) {
    return;
  }

  output.log('');
  const proceedWithPlan =
    yes ||
    skipSetupConfirm ||
    (await client.input.confirm(
      `${chalk.bold('Continue with this link plan?')}\n${chalk.dim('  Review the table above, then confirm to apply it.')}`,
      true
    ));
  if (!proceedWithPlan) {
    output.print(`Canceled. Repository not linked.\n`);
    return;
  }

  return;

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
      message: `Which Projects should be ${projects.length ? 'linked to' : 'created'
        }?`,
      choices: [
        ...(addSeparators
          ? [new Separator('----- Existing Projects -----')]
          : []),
        ...projects.map(project => {
          const dir = project.rootDirectory || '.';
          return {
            name: `${org.slug}/${project.name} ${chalk.gray(`(${dir})`)}`,
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
                  basename(rootDirectory) || basename(rootPath),
                  i > 0 ? framework.slug : '',
                ]
                  .filter(Boolean)
                  .join('-')
              );
              return {
                name: `${org.slug}/${name} ${chalk.gray(`(${rootDirectory || '.'} · ${framework.name})`)}`,
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
    if (!('newProject' in selection)) continue;
    const np = selection as NewProject;
    if (!np.newProject) continue;
    const orgAndName = `${org.slug}/${np.name}`;
    output.spinner(`Creating new Project: ${orgAndName}`);
    const project = (selected[i] = await createProject(client, {
      name: np.name,
      ...(np.rootDirectory ? { rootDirectory: np.rootDirectory } : {}),
      framework: frameworkToSlug(np.framework),
    }));
    await connectGitProvider(
      client,
      project.id,
      parsedRepoUrl!.provider,
      `${parsedRepoUrl!.org}/${parsedRepoUrl!.repo}`
    );
    output.log(
      `Created new Project: ${output.link(
        orgAndName,
        `https://vercel.com/${orgAndName}`,
        { fallback: false }
      )}`
    );
  }

  const repoProjects = selected.map(project => {
    if (!('id' in project)) {
      // Shouldn't happen at this point, but just to make TS happy
      throw new TypeError(`Not a Project: ${JSON.stringify(project)}`);
    }
    return {
      id: project.id,
      name: project.name,
      directory: normalizePath(project.rootDirectory || '.'),
      orgId: org.id,
    };
  });

  return { remoteName, projects: repoProjects, orgSlug: org.slug };
}

export async function ensureRepoLink(
  client: Client,
  cwd: string,
  { yes, overwrite, skipSetupConfirm }: EnsureRepoLinkOptions
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
      skipSetupConfirm,
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
    updateProjectSettings?: boolean;
  }
): string {
  let cell: string;
  if (options.isMoving) {
    cell = `${chalk.dim(fromDisplay)} ${chalk.dim('->')} ${chalk.hex('#FFB300')(toDisplay)}`;
  } else {
    cell = fromDisplay;
  }
  if (options.updateProjectSettings) {
    cell = `${cell}${chalk.dim(' · updates project settings')}`;
  }
  return cell;
}

function rootCellForProjectWithDirectoryOptions(
  sel:
    | NonGitLinkedProject
    | GitLinkedProjectWithMisconfiguredRootDirectory
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
    updateProjectSettings: sel.updateDirectoryInProjectSettings,
  });
}

function linkSelectionTableRow(
  sel:
    | GitLinkedProject
    | GitLinkedProjectWithMisconfiguredRootDirectory
    | NonGitLinkedProject
    | DetectedProject,
  orgSlug: string,
  rootPath: string
): string[] {
  switch (sel.type) {
    case 'gitLinkedProject':
      return [
        `${orgSlug}/${sel.name}`,
        formatRootForDisplay(sel.directory),
        formatFrameworkLabel(sel.framework),
      ];
    case 'nonGitLinkedProject':
      return [
        `${sel.orgSlug}/${sel.name}`,
        rootCellForProjectWithDirectoryOptions(sel),
        formatFrameworkLabel(sel.framework),
      ];
    case 'gitLinkedProjectWithMisconfiguredRootDirectory':
      return [
        `${sel.orgSlug}/${sel.name}`,
        rootCellForProjectWithDirectoryOptions(sel),
        formatFrameworkLabel(sel.framework),
      ];
    case 'detectedProject': {
      if (sel.frameworks.length === 0) {
        return [
          '—',
          formatRootForDisplay(sel.rootDirectory),
          chalk.dim('—'),
        ];
      }
      const proposedNames = sel.frameworks.map(
        (framework, i) =>
          `${orgSlug}/${slugify(
            [
              basename(sel.rootDirectory) || basename(rootPath),
              i > 0 ? framework.slug : '',
            ]
              .filter(Boolean)
              .join('-')
          )}`
      );
      return [
        proposedNames.join(', '),
        formatRootForDisplay(sel.rootDirectory),
        sel.frameworks.map(f => formatFrameworkLabelFromFramework(f)).join(', '),
      ];
    }
    default: {
      const _exhaustive: never = sel;
      void _exhaustive;
      return ['—', '—', '—'];
    }
  }
}

/**
 * Prints the link plan table. Returns whether any rows were shown (caller may confirm next).
 */
function printLinkSelectionSummary(options: {
  orgSlug: string;
  rootPath: string;
  selections: (
    | GitLinkedProject
    | GitLinkedProjectWithMisconfiguredRootDirectory
    | NonGitLinkedProject
    | DetectedProject
  )[];
}): boolean {
  const { orgSlug, rootPath, selections } = options;

  output.log('');
  output.log(chalk.bold('Link plan'));

  if (selections.length === 0) {
    output.log(chalk.yellow('\nNo projects selected.'));
    return false;
  }

  const header = [
    chalk.bold('Project'),
    chalk.bold('Root directory'),
    chalk.bold('Framework'),
  ].map(cell => chalk.cyan(cell));

  const rows = selections.map(sel =>
    linkSelectionTableRow(sel, orgSlug, rootPath)
  );

  output.log(
    `\n${table([header, ...rows], {
      align: ['l', 'l', 'l'],
      hsep: 2,
    })}`
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
      message: `${chalk.blue(chalk.bold(project.name))} (${chalk.gray(project.orgSlug)}) is not linked to this repository`,
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
      message: `${chalk.blue(chalk.bold(project.name))} (${chalk.gray(project.orgSlug)}) the root directory is "${chalk.gray(normalizeRootDirectoryPath(project.directory) === '' ? '.' : normalizeRootDirectoryPath(project.directory))}", but the suggested directory is "${chalk.gray(normalizeRootDirectoryPath(project.suggestedDirectory))}".`,
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
    if (moveOption !== 'no') {
      updateDirectoryInProjectSettings = await client.input.confirm(
        `Would you like to update the root directory in the project settings to "${chalk.gray(normalizeRootDirectoryPath(project.suggestedDirectory))}"?`,
        true
      );
    }
    if (moveOption === 'yes') {
      directory = project.suggestedDirectory;
    }
    if (moveOption === 'no') {
      directory = project.directory;
    }
    if (moveOption === 'choose-different-directory') {
      directory = await client.input.text({
        message: 'Enter the new directory',
      });
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


