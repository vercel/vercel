import type Client from '../client';
import type { FetchOptions } from '../client';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import chalk from 'chalk';
import { ProjectNotFound } from '../../util/errors-ts';
import type { Project, Org } from '@vercel-internals/types';
import slugify from '@sindresorhus/slugify';
import output from '../../output-manager';
import { printAlignedLabel } from '../output/print-aligned-label';
import { Separator } from '@inquirer/select';
import { isPromptBackError } from './prompt-cancellation';
import type { CrossTeamMatch } from '../projects/search-project-across-teams';

type ProjectDecision = 'create' | 'existing';
const SEARCH_ALL_PROJECTS = 'search-all-projects' as const;
const CREATE_NEW_PROJECT = 'create-new-project' as const;
const BACK_TO_PROJECT_SELECTION = Symbol('back-to-project-selection');
export const BACK_TO_TEAM_SELECTION = Symbol('back-to-team-selection');
export const LINK_ALL_PROJECTS = Symbol('link-all-projects');
const CHOOSE_DIFFERENT_REMOTE = 'choose-different-remote' as const;
const NO_EXISTING_PROJECTS = Symbol('no-existing-projects');

/**
 * The user chose a different Git remote; the caller re-runs the suggestion
 * search against `remoteName`.
 */
export interface SelectRemote {
  selectRemote: string;
}

export function isSelectRemote(value: unknown): value is SelectRemote {
  return typeof value === 'object' && value !== null && 'selectRemote' in value;
}

async function inputProjectDecision(
  client: Client,
  defaultDecision: ProjectDecision
): Promise<ProjectDecision> {
  const createChoice = {
    name: 'Create new project',
    value: 'create' as const,
  };
  const existingChoice = {
    name: 'Link existing project',
    value: 'existing' as const,
  };

  return await client.input.select<ProjectDecision>({
    message: 'Project?',
    choices:
      defaultDecision === 'existing'
        ? [existingChoice, createChoice]
        : [createChoice, existingChoice],
  });
}

function randomNameSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

/**
 * Suggests a default for the new-project `Name?` prompt. When the slugified
 * folder name is already a project in the team, suggest a variant with a
 * short random suffix instead of a default that can only fail the
 * "Project already exists" validation.
 */
async function suggestNewProjectName(
  client: Client,
  org: Org,
  slugifiedName: string,
  knownTaken: boolean
): Promise<string> {
  let taken = knownTaken;
  if (!taken) {
    try {
      const existing = await getProjectByIdOrName(
        client,
        slugifiedName,
        org.id
      );
      taken = !(existing instanceof ProjectNotFound);
    } catch {
      // Suggestion only; submit-time validation still guards.
      taken = false;
    }
  }
  return taken ? `${slugifiedName}-${randomNameSuffix()}` : slugifiedName;
}

function promptForProjectName(
  client: Client,
  org: Org,
  defaultName: string | undefined,
  message = 'Name?'
): Promise<string> {
  return client.input.text({
    message,
    default: defaultName,
    validate: async val => {
      if (!val) {
        return 'Project name cannot be empty';
      }
      const project = await getProjectByIdOrName(client, val, org.id);
      if (!(project instanceof ProjectNotFound)) {
        return 'Project already exists';
      }
      return true;
    },
  });
}

async function promptForProjectNameWithBack(
  client: Client,
  org: Org,
  defaultName: string
): Promise<string | typeof BACK_TO_PROJECT_SELECTION> {
  try {
    return await client.withPromptBackNavigation(() =>
      promptForProjectName(
        client,
        org,
        defaultName,
        `Name? ${chalk.dim('Press ↑ to return to project options')}`
      )
    );
  } catch (error) {
    if (isPromptBackError(error)) {
      return BACK_TO_PROJECT_SELECTION;
    }
    throw error;
  }
}

async function searchExistingProjects(
  client: Client,
  org: Org,
  allowBack: boolean
): Promise<
  Project | typeof BACK_TO_PROJECT_SELECTION | typeof NO_EXISTING_PROJECTS
> {
  const firstPage = await client.fetch<{
    projects: Project[];
    pagination: { count: number; next: number | null };
  }>(`/v9/projects?limit=100`, { accountId: org.id });
  const projects = firstPage.projects;
  const hasMoreProjects = firstPage.pagination.next != null;

  if (projects.length === 0) {
    output.log(
      `No existing projects found under ${chalk.bold(org.slug)}. Creating new project.`
    );
    return NO_EXISTING_PROJECTS;
  }

  const pageSize = 15;
  const countHint =
    projects.length > pageSize
      ? ` ${chalk.dim(
          `(${hasMoreProjects ? '100+' : projects.length} projects)`
        )}`
      : '';

  return await client.input.search<Project | typeof BACK_TO_PROJECT_SELECTION>({
    message: `Which project?${countHint}`,
    pageSize,
    source: async (term, { signal }) => {
      const searchTerm = term?.trim();
      let matchingProjects = projects;

      if (searchTerm) {
        if (hasMoreProjects) {
          matchingProjects = (
            await client.fetch<{ projects: Project[] }>(
              `/v9/projects?search=${encodeURIComponent(searchTerm)}&limit=20`,
              {
                accountId: org.id,
                signal: signal as FetchOptions['signal'],
              }
            )
          ).projects;
        } else {
          const normalizedSearchTerm = searchTerm.toLowerCase();
          matchingProjects = projects.filter(
            project =>
              project.name.toLowerCase().includes(normalizedSearchTerm) ||
              project.id === searchTerm
          );
        }
      }

      const choices: Array<{
        name: string;
        value: Project | typeof BACK_TO_PROJECT_SELECTION;
      }> = matchingProjects
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(project => ({
          name: project.name,
          value: project,
        }));

      if (!allowBack) {
        return choices;
      }

      const backChoice: {
        name: string;
        value: typeof BACK_TO_PROJECT_SELECTION;
      } = {
        name: 'Back to project options',
        value: BACK_TO_PROJECT_SELECTION,
      };

      // No matches: only the way back remains.
      if (choices.length === 0) {
        return [backChoice];
      }

      // A search term filters the list down to projects only.
      if (searchTerm) {
        return choices;
      }

      // Unfiltered list: pin the way back to the end, after a separator,
      // instead of floating it mid-list on long project lists.
      return [...choices, new Separator(), backChoice];
    },
  });
}

/**
 * Offer to link every project in the repository in one pass. Only set when
 * `vc link` runs from the repository root and more than one project on Vercel
 * is already connected to this repository's Git remote.
 */
export interface MultiProjectOffer {
  /** Projects already connected to this repo's Git remote in the team. */
  connectedCount: number;
}

/**
 * The Git remote that project suggestions were derived from, plus whether the
 * repo has others to switch to.
 */
export interface RemoteContext {
  /** Name of the remote in use (`origin` unless the repo has no `origin`). */
  remoteName: string;
  /** Remote names available to switch to, excluding the one in use. */
  otherRemoteNames: string[];
}

/**
 * Picks which Git remote the project suggestions should come from. Includes a
 * way back, since arriving here from the project picker should not be a
 * one-way door.
 */
async function promptForRemote(
  client: Client,
  { remoteName, otherRemoteNames }: RemoteContext
): Promise<string | typeof BACK_TO_PROJECT_SELECTION> {
  const choices: Array<{
    name: string;
    value: string | typeof BACK_TO_PROJECT_SELECTION;
  }> = [remoteName, ...otherRemoteNames].map(name => ({
    name: name === remoteName ? `${name} ${chalk.bold('(current)')}` : name,
    value: name,
  }));
  choices.push({
    name: 'Back to project options',
    value: BACK_TO_PROJECT_SELECTION,
  });

  return await client.input.select<string | typeof BACK_TO_PROJECT_SELECTION>({
    message: 'Which Git remote?',
    choices,
    default: remoteName,
  });
}

export default async function inputProject(
  client: Client,
  org: Org,
  detectedProjectName: string,
  autoConfirm = false,
  skipAutoDetect = false,
  showProjectSuggestions = false,
  allowTeamSelectionBack = false,
  repoMatches: CrossTeamMatch[] = [],
  multiProjectOffer?: MultiProjectOffer,
  remoteContext?: RemoteContext
): Promise<
  | Project
  | CrossTeamMatch
  | string
  | typeof BACK_TO_TEAM_SELECTION
  | typeof LINK_ALL_PROJECTS
  | SelectRemote
> {
  const slugifiedName = slugify(detectedProjectName);

  // attempt to auto-detect a project to link
  let detectedProject: Project | null = null;

  if (!skipAutoDetect && repoMatches.length === 0) {
    output.spinner('Searching for existing projects…', 1000);

    const [project, slugifiedProject] = await Promise.all([
      getProjectByIdOrName(client, detectedProjectName, org.id),
      slugifiedName !== detectedProjectName
        ? getProjectByIdOrName(client, slugifiedName, org.id)
        : null,
    ]);

    detectedProject = !(project instanceof ProjectNotFound)
      ? project
      : !(slugifiedProject instanceof ProjectNotFound)
        ? slugifiedProject
        : null;

    if (detectedProject && !detectedProject.id) {
      throw new Error(`Detected linked project does not have "id".`);
    }

    output.stopSpinner();
  }

  if (autoConfirm) {
    // A single Git-linked root-directory match is the strongest signal.
    if (repoMatches.length === 1) {
      return repoMatches[0];
    }
    return detectedProject || detectedProjectName;
  }

  if (client.nonInteractive) {
    if (detectedProject) {
      return detectedProject;
    }
    const err = new Error('Confirmation required');
    (err as NodeJS.ErrnoException).code = 'HEADLESS';
    throw err;
  }

  // When auto-detect ran and found nothing, the slugified name is known to be
  // free; otherwise check once so the suggested default is actually creatable.
  const slugifiedNameKnownFree =
    !skipAutoDetect && repoMatches.length === 0 && !detectedProject;
  let memoizedDefaultName: string | undefined;
  async function defaultNewProjectName(): Promise<string> {
    if (memoizedDefaultName === undefined) {
      memoizedDefaultName = slugifiedNameKnownFree
        ? slugifiedName
        : await suggestNewProjectName(
            client,
            org,
            slugifiedName,
            detectedProject?.name === slugifiedName
          );
    }
    return memoizedDefaultName;
  }

  let shouldLinkProject: boolean;

  if (showProjectSuggestions && !skipAutoDetect) {
    for (;;) {
      type ProjectPickerValue =
        | Project
        | CrossTeamMatch
        | typeof SEARCH_ALL_PROJECTS
        | typeof CREATE_NEW_PROJECT
        | typeof BACK_TO_TEAM_SELECTION
        | typeof LINK_ALL_PROJECTS
        | typeof CHOOSE_DIFFERENT_REMOTE;
      const choices: Array<
        | Separator
        | {
            name: string;
            value: ProjectPickerValue;
            description?: string;
          }
      > = [];

      // Repository-wide linking is the strongest default when the command runs
      // from the root of a repo whose workspace detection found several
      // projects: one pass links them all instead of repeating `vc link`.
      if (multiProjectOffer) {
        const { connectedCount } = multiProjectOffer;
        choices.push({
          name: `Link all ${connectedCount} projects connected to this repo ${chalk.gray(
            '(recommended)'
          )}`,
          value: LINK_ALL_PROJECTS,
          // The label already states the count and that these are connected to
          // this repo, so the footer only names the remote that produced them.
          description: remoteContext
            ? `Using remote ${remoteContext.remoteName}`
            : undefined,
        });
      }

      if (repoMatches.length > 0) {
        choices.push(
          ...repoMatches.map(match => ({
            name: `${match.project.name} ${chalk.gray('(linked by git)')}`,
            value: match,
          })),
          new Separator()
        );
      } else if (detectedProject) {
        choices.push(
          {
            name: `${detectedProject.name} ${chalk.gray('(folder name)')}`,
            value: detectedProject,
          },
          new Separator()
        );
      } else if (multiProjectOffer) {
        // Keep the repo-wide option visually separated from the fallback
        // actions even when there is no per-directory suggestion.
        choices.push(new Separator());
      }
      choices.push(
        {
          name: 'Search all projects',
          value: SEARCH_ALL_PROJECTS,
          description: 'Browse or search every project in this team',
        },
        {
          name: 'Create a new project',
          value: CREATE_NEW_PROJECT,
          description: `Create it under ${org.slug}`,
        }
      );
      if (allowTeamSelectionBack) {
        choices.push({
          name: 'Choose a different team',
          value: BACK_TO_TEAM_SELECTION,
          description: 'Return to team selection',
        });
      }
      // Only worth offering when the repo actually has another remote: with a
      // single remote there is no choice to make.
      if (remoteContext && remoteContext.otherRemoteNames.length > 0) {
        choices.push({
          // Name the remote in the label, not just the description: unlike the
          // team, which the "Which team?" line above still shows, nothing else
          // on screen says which remote produced these suggestions, and
          // descriptions only render for the highlighted row.
          name: `Choose a different remote ${chalk.gray(
            `(using ${remoteContext.remoteName})`
          )}`,
          value: CHOOSE_DIFFERENT_REMOTE,
          description: `Also available: ${remoteContext.otherRemoteNames.join(
            ', '
          )}`,
        });
      }

      const selected = await client.input.select<ProjectPickerValue>({
        message: 'Which project?',
        choices,
      });

      if (selected === BACK_TO_TEAM_SELECTION) {
        return BACK_TO_TEAM_SELECTION;
      }
      if (selected === LINK_ALL_PROJECTS) {
        return LINK_ALL_PROJECTS;
      }
      if (selected === CHOOSE_DIFFERENT_REMOTE) {
        const remoteName = await promptForRemote(client, remoteContext!);
        if (remoteName === BACK_TO_PROJECT_SELECTION) {
          continue;
        }
        return { selectRemote: remoteName };
      }
      if (selected === CREATE_NEW_PROJECT) {
        const projectName = await promptForProjectNameWithBack(
          client,
          org,
          await defaultNewProjectName()
        );
        if (projectName === BACK_TO_PROJECT_SELECTION) {
          continue;
        }
        return projectName;
      }
      if (selected !== SEARCH_ALL_PROJECTS) {
        return selected;
      }

      const existingProject = await searchExistingProjects(client, org, true);
      if (existingProject === BACK_TO_PROJECT_SELECTION) {
        continue;
      }
      if (existingProject === NO_EXISTING_PROJECTS) {
        const projectName = await promptForProjectNameWithBack(
          client,
          org,
          slugifiedName
        );
        if (projectName === BACK_TO_PROJECT_SELECTION) {
          continue;
        }
        return projectName;
      }
      return existingProject;
    }
  } else if (!detectedProject) {
    const decision = await inputProjectDecision(
      client,
      skipAutoDetect ? 'existing' : 'create'
    );
    shouldLinkProject = decision === 'existing';
  } else {
    // auto-detected a project to link
    output.print(`  ${chalk.bold('Found existing project')}\n`);
    printAlignedLabel('Project', `${org.slug}/${detectedProject.name}`);
    if (await client.input.confirm(`Link directory to project?`, true)) {
      return detectedProject;
    }

    // user doesn't want to link the auto-detected project
    const decision = await inputProjectDecision(client, 'existing');
    shouldLinkProject = decision === 'existing';
  }

  if (shouldLinkProject) {
    const existingProject = await searchExistingProjects(client, org, false);
    if (
      existingProject !== NO_EXISTING_PROJECTS &&
      existingProject !== BACK_TO_PROJECT_SELECTION
    ) {
      return existingProject;
    }
  }

  // user wants to create a new project
  return await promptForProjectName(client, org, await defaultNewProjectName());
}
