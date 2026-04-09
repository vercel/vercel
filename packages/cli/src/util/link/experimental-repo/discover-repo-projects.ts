import chalk from 'chalk';
import slugify from '@sindresorhus/slugify';
import { basename, join, relative } from 'path';
import { normalizePath } from '@vercel/build-utils';
import { getRemoteUrls } from '../../create-git-meta';
import selectOrg from '../../input/select-org';
import type Client from '../../client';
import type { Framework } from '@vercel/frameworks';
import type { Org, Project } from '@vercel-internals/types';
import { ProjectNotFound } from '../../errors-ts';
import createProject from '../../projects/create-project';
import getProjectByNameOrId from '../../projects/get-project-by-id-or-name';
import { detectProjects } from '../../projects/detect-projects';
import {
  connectGitProvider,
  parseRepoUrl,
} from '../../git/connect-git-provider';
import { repoInfoToUrl } from '../../git/repo-info-to-url';
import { getGitConfigPath } from '../../git-helpers';
import output from '../../../output-manager';
import table from '../../output/table';
import {
  formatFrameworkLabel,
  formatFrameworkLabelFromFramework,
} from '../../format-framework-label';
import { alignColumnCells } from '../../align-column-cells';
import { searchProjectsForLinkDiscoveryByRoots } from '../../projects/search-project-across-teams';
import type { RepoProjectConfig } from '../repo';

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

function isLinkedToRepo(
  project: Project,
  repoInfo: ReturnType<typeof parseRepoUrl>
): boolean {
  if (!repoInfo) return false;
  if (
    project.link?.repo === repoInfo.repo &&
    project.link?.org === repoInfo.org
  ) {
    return true;
  }
  return false;
}

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
  await client.fetch<Project>(`/v9/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: { rootDirectory: dirNorm === '' ? null : dirNorm },
  });
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

async function fetchVercelProjectsLinkedToRepo(
  client: Client,
  orgSlug: string,
  repoUrl: string
): Promise<Project[]> {
  output.spinner(
    `Searching for matching projects under ${chalk.bold(orgSlug)}…`
  );
  const query = new URLSearchParams({ repoUrl });
  const projectsIterator = client.fetchPaginated<{
    projects: Project[];
  }>(`/v9/projects?${query}`);
  let acc: Project[] = [];
  for await (const chunk of projectsIterator) {
    acc = acc.concat(chunk.projects);
    if (chunk.pagination.next) {
      output.spinner(`Searching under ${chalk.bold(orgSlug)}…`, 0);
    }
  }
  return acc;
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
export async function discoverRepoProjectsExperimental(
  client: Client,
  rootPath: string,
  {
    yes,
    existingProjectIds,
    existingDirectories,
    existingRemoteName,
    projectNameOrId,
  }: {
    yes: boolean;
    existingProjectIds?: Set<string>;
    existingDirectories?: Set<string>;
    /** When set, skip the remote selection prompt and use this remote. */
    existingRemoteName?: string;
    /**
     * Resolve this project in the selected scope; run detection for path/git
     * suggestions but do not offer local “new project” rows.
     */
    projectNameOrId?: string;
  }
): Promise<
  | { remoteName: string; projects: RepoProjectConfig[]; orgSlug: string }
  | undefined
> {
  // Detect the projects on the filesystem out of band, so that
  // they will be ready by the time the projects are listed
  const detectedProjectsPromise = detectProjects(rootPath).catch(
    (err: unknown) => {
      output.debug(`Failed to detect local projects: ${err}`);
      return new Map<string, Framework[]>();
    }
  );

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

  let focusedProject: Project | undefined;
  if (projectNameOrId?.trim()) {
    const raw = projectNameOrId.trim();
    const fetched = await getProjectByNameOrId(client, raw, org.id);
    if (fetched instanceof ProjectNotFound) {
      throw new Error(
        `Project not found: "${raw}" under scope "${org.slug}". Check --project and --scope / --team.`
      );
    }
    if (fetched.accountId !== org.id) {
      throw new Error(
        `Project "${fetched.name}" is not in the selected scope (${org.slug}).`
      );
    }
    focusedProject = fetched;
  }

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
  output.debug(`Link discovery: ${repoUrl} → ${repoInfoToUrl(parsedRepoUrl)}`);

  const linkDemoId = process.env.LINK_DEMO?.trim();
  let projects: Project[] = [];
  let detectedProjects: Map<string, Framework[]>;

  if (linkDemoId) {
    detectedProjects = await detectedProjectsPromise;
    output.print(
      `${chalk.yellow(
        `LINK_DEMO=${linkDemoId} — loading fixture (skipping project API & search)`
      )}\n`
    );
    const { applyLinkDemoScenario } = await import('../link-demo-scenarios');
    applyLinkDemoScenario(linkDemoId, org, p, detectedProjects);
  } else {
    [detectedProjects, projects] = await Promise.all([
      detectedProjectsPromise,
      fetchVercelProjectsLinkedToRepo(client, org.slug, repoUrl),
    ]);

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

    const rootsForSearch: Array<{ rootDirectory: string; folderName: string }> =
      [];
    for (const [rootDirectory] of detectedProjects) {
      const folderName =
        normalizeRootDirectoryPath(rootDirectory) === ''
          ? cwdFolder
          : rootDirectory.split('/').pop();
      if (!folderName) continue;
      rootsForSearch.push({ rootDirectory, folderName });
    }

    const matchesByRootDirectory = await searchProjectsForLinkDiscoveryByRoots(
      client,
      rootsForSearch
    );

    const nonGitLinkedProjects = new Map<string, FoundProject[]>();
    const gitLinkedProjectsWithMisconfiguredRootDirectory = new Map<
      string,
      FoundProject[]
    >();
    for (const { rootDirectory, folderName } of rootsForSearch) {
      const frameworks = detectedProjects.get(rootDirectory);
      if (!frameworks) continue;
      const matches = matchesByRootDirectory.get(rootDirectory) ?? [];
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

  const normCwdFromRoot = cwdRelativePathFromRepoRoot(rootPath, client.cwd);
  const cwdProjectScope = resolveCwdLinkScope(normCwdFromRoot, p);
  if (cwdProjectScope !== null) {
    filterRepoLinkBucketsByScope(cwdProjectScope, p);
  }

  if (!linkDemoId && focusedProject) {
    filterRepoLinkBucketsToProjectId(p, focusedProject.id);
    ensureFocusedProjectNonGitRowIfNeeded(
      client,
      rootPath,
      org,
      focusedProject,
      p,
      parsedRepoUrl
    );
    p.detectedProjects = new Map();
  }

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

  const duplicatePrimaryNames = collectDuplicatePrimaryProjectNames(p);

  const gitLinkedCheckboxSpecs: CheckboxRowSpec[] = p.gitLinkedProjects.map(
    project => ({
      cells: [
        projectNameCellForLinkTable(
          project.name,
          project.orgId,
          duplicatePrimaryNames
        ),
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
        projectNameCellForLinkTable(
          project.name,
          project.orgId,
          duplicatePrimaryNames
        ),
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
        projectNameCellForLinkTable(
          project.name,
          project.orgId,
          duplicatePrimaryNames
        ),
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

  // Non-interactive: creating projects from local detection is unsupported — no
  // table, message, or repo.json write (same as canceling with nothing to apply).
  if (
    yes &&
    allInteractiveSpecs.length > 0 &&
    allInteractiveSpecs.every(spec => spec.value.type === 'detectedProject')
  ) {
    output.stopSpinner();
    output.print(
      `\n${chalk.yellow(
        'Non-interactive mode (--yes) cannot create new Vercel projects from local detection, and no existing projects were found to link in the selected scope.'
      )}\n`
    );
    return;
  }

  if (normCwdFromRoot !== '' && cwdProjectScope === null) {
    output.print(
      `${chalk.dim(
        'Current directory is not a project folder. Showing link options for the whole repository.'
      )}`
    );
  } else if (cwdProjectScope !== null) {
    output.print(
      `${chalk.dim(
        `Showing projects for ${formatRootForDisplay(
          cwdProjectScope
        )} only (from your current directory).`
      )}`
    );
  }

  output.stopSpinner();

  let selected2: Choice['value'][];

  if (allInteractiveSpecs.length === 0) {
    selected2 = [];
  } else if (allInteractiveSpecs.length === 1) {
    const sole = allInteractiveSpecs[0];
    const soleRowNeedsSetupPhase =
      sole.value.type === 'nonGitLinkedProject' ||
      sole.value.type === 'gitLinkedProjectWithMisconfiguredRootDirectory';
    // With --yes, a row that runs the non-interactive setup phase would otherwise
    // print this preview table and then printLinkSelectionSummary (post-setup) — duplicate.
    const skipSingleRowPreviewForYesSetup = yes && soleRowNeedsSetupPhase;
    if (!skipSingleRowPreviewForYesSetup) {
      output.print(
        `\n${table([repoLinkSelectionTableHeaders, sole.cells], {
          align: ['l', 'l', 'l', 'l'],
          hsep: 2,
        })}\n`
      );
    }
    if (yes) {
      selected2 = [sole.value];
    } else if (soleRowNeedsSetupPhase) {
      // Preview is enough; go straight to project setup (connect / root dir, etc.).
      selected2 = [sole.value];
    } else {
      const linkThis = await client.input.confirm(
        linkRepoApplyConfirmMessage(1),
        true
      );
      selected2 = linkThis ? [sole.value] : [];
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
    } else {
      selected2 = await client.input.checkbox<Choice['value']>({
        message: 'Select projects to link',
        choices,
        theme: {
          style: {
            renderSelectedChoices: (
              selectedChoices: ReadonlyArray<{ value: Choice['value'] }>
            ) =>
              formatRepoLinkCheckboxSelectionSummary(rootPath, selectedChoices),
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
    if (yes && allInteractiveSpecs.length === 0) {
      output.print(
        `\n${chalk.yellow(
          'No Vercel projects found to link for this repository in the selected scope.'
        )}\n`
      );
    } else {
      output.print(`\n${chalk.yellow('No projects selected.')}\n`);
    }
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
    // output.print(JSON.stringify(selected2, null, 2));
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

/** Path from repo root to `cwd`, normalized for comparisons (`""` = repo root). */
function cwdRelativePathFromRepoRoot(repoRoot: string, cwd: string): string {
  const rel = relative(repoRoot, cwd);
  if (!rel || rel === '') return '';
  return normalizeRootDirectoryPath(normalizePath(rel));
}

type RepoLinkBuckets = {
  gitLinkedProjects: GitLinkedProject[];
  gitLinkedProjectsWithMisconfiguredRootDirectory: GitLinkedProjectWithMisconfiguredRootDirectory[];
  nonGitLinkedProjects: NonGitLinkedProject[];
  detectedProjects: Map<string, Framework[]>;
};

function collectDuplicatePrimaryProjectNames(p: RepoLinkBuckets): Set<string> {
  const counts = new Map<string, number>();
  const bump = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const g of p.gitLinkedProjects) bump(g.name);
  for (const m of p.gitLinkedProjectsWithMisconfiguredRootDirectory)
    bump(m.name);
  for (const n of p.nonGitLinkedProjects) bump(n.name);
  const dups = new Set<string>();
  for (const [name, c] of counts) {
    if (c > 1) dups.add(name);
  }
  return dups;
}

function projectNameCellForLinkTable(
  name: string,
  orgId: string,
  duplicateNames: Set<string>
): string {
  if (duplicateNames.has(name)) {
    return chalk.bold(name) + chalk.dim(` (${orgId})`);
  }
  return chalk.bold(name);
}

function filterRepoLinkBucketsToProjectId(
  p: RepoLinkBuckets,
  id: string
): void {
  p.gitLinkedProjects = p.gitLinkedProjects.filter(g => g.id === id);
  p.gitLinkedProjectsWithMisconfiguredRootDirectory =
    p.gitLinkedProjectsWithMisconfiguredRootDirectory.filter(m => m.id === id);
  p.nonGitLinkedProjects = p.nonGitLinkedProjects.filter(n => n.id === id);
}

/**
 * When `--project` targets an existing Vercel project but discovery would only
 * show a “new project” row, synthesize a non–git-linked row so the user can
 * connect Git / adjust root using the same flow as other primary rows.
 */
function ensureFocusedProjectNonGitRowIfNeeded(
  client: Client,
  rootPath: string,
  org: Org,
  focused: Project,
  p: RepoLinkBuckets,
  parsedRepoUrl: NonNullable<ReturnType<typeof parseRepoUrl>>
): void {
  const hasRow =
    p.gitLinkedProjects.some(g => g.id === focused.id) ||
    p.gitLinkedProjectsWithMisconfiguredRootDirectory.some(
      m => m.id === focused.id
    ) ||
    p.nonGitLinkedProjects.some(n => n.id === focused.id);
  if (hasRow) {
    return;
  }

  const suggestedDirectory = cwdRelativePathFromRepoRoot(rootPath, client.cwd);
  let frameworks: Framework[] = [];
  for (const key of [
    suggestedDirectory,
    normalizePath(suggestedDirectory),
    '',
  ]) {
    const f = p.detectedProjects.get(key);
    if (f?.length) {
      frameworks = f;
      break;
    }
  }

  const dirNorm = normalizeRootDirectoryPath(focused.rootDirectory);
  const sugNorm = normalizeRootDirectoryPath(suggestedDirectory);

  p.nonGitLinkedProjects.push({
    type: 'nonGitLinkedProject',
    id: focused.id,
    name: focused.name,
    directory: dirNorm,
    suggestedDirectory: sugNorm,
    framework: focused.framework,
    orgId: org.id,
    matchesFramework: frameworks.some(fw => fw.slug === focused.framework),
    matchesTeam: true,
    matchesRootDirectory: dirNorm === sugNorm,
    isLinkedToThisRepo: isLinkedToRepo(focused, parsedRepoUrl),
  });
}

function collectDirectoryRootsForCwdScope(p: RepoLinkBuckets): Set<string> {
  const roots = new Set<string>();
  for (const g of p.gitLinkedProjects) {
    roots.add(normalizeRootDirectoryPath(g.directory));
  }
  for (const m of p.gitLinkedProjectsWithMisconfiguredRootDirectory) {
    roots.add(normalizeRootDirectoryPath(m.directory));
    roots.add(normalizeRootDirectoryPath(m.suggestedDirectory));
  }
  for (const n of p.nonGitLinkedProjects) {
    roots.add(normalizeRootDirectoryPath(n.directory));
    roots.add(normalizeRootDirectoryPath(n.suggestedDirectory));
  }
  for (const k of p.detectedProjects.keys()) {
    roots.add(normalizeRootDirectoryPath(k));
  }
  return roots;
}

/**
 * When cwd is inside a known project root (Vercel or locally detected), returns
 * that root directory key; otherwise `null` (treat as repo-wide / not a project folder).
 */
function resolveCwdLinkScope(
  normCwdRelative: string,
  p: RepoLinkBuckets
): string | null {
  if (normCwdRelative === '') {
    return null;
  }
  const roots = collectDirectoryRootsForCwdScope(p);
  let best: string | null = null;
  let bestLen = -1;
  for (const r of roots) {
    let inside = false;
    if (r === '') {
      inside = normCwdRelative === '';
    } else {
      inside = normCwdRelative === r || normCwdRelative.startsWith(`${r}/`);
    }
    if (!inside) continue;
    if (r.length > bestLen) {
      bestLen = r.length;
      best = r;
    }
  }
  return best;
}

function filterRepoLinkBucketsByScope(scope: string, p: RepoLinkBuckets): void {
  const sc = normalizeRootDirectoryPath(scope);
  p.gitLinkedProjects = p.gitLinkedProjects.filter(
    g => normalizeRootDirectoryPath(g.directory) === sc
  );
  p.gitLinkedProjectsWithMisconfiguredRootDirectory =
    p.gitLinkedProjectsWithMisconfiguredRootDirectory.filter(
      m =>
        normalizeRootDirectoryPath(m.suggestedDirectory) === sc ||
        normalizeRootDirectoryPath(m.directory) === sc
    );
  p.nonGitLinkedProjects = p.nonGitLinkedProjects.filter(
    n =>
      normalizeRootDirectoryPath(n.suggestedDirectory) === sc ||
      normalizeRootDirectoryPath(n.directory) === sc
  );
  for (const k of [...p.detectedProjects.keys()]) {
    if (normalizeRootDirectoryPath(k) !== sc) {
      p.detectedProjects.delete(k);
    }
  }
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
  const willUpdateProjectSettings = Boolean(
    sel.updateDirectoryInProjectSettings
  );
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
        sel.frameworks
          .map(f => formatFrameworkLabelFromFramework(f))
          .join(', '),
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

  const includeActionColumn = selections.some(
    selectionHasNonemptyLinkPlanAction
  );
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
        `Would you like to update the root directory in the project settings to "${chalk.gray(formatRootForDisplay(directory ?? ''))}"?`,
        true
      );
    }
  }
  project.confirmed = true;
  project.connectionOption = connectionOption;
  project.updateDirectoryInProjectSettings = updateDirectoryInProjectSettings;
  project.moveDirectory = directory ?? null;
}
