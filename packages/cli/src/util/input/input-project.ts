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

type ProjectDecision = 'create' | 'existing';
const SEARCH_ALL_PROJECTS = 'search-all-projects' as const;
const CREATE_NEW_PROJECT = 'create-new-project' as const;
const BACK_TO_PROJECT_SELECTION = Symbol('back-to-project-selection');
export const BACK_TO_TEAM_SELECTION = Symbol('back-to-team-selection');
const NO_EXISTING_PROJECTS = Symbol('no-existing-projects');

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

  return await client.input.search<Project | typeof BACK_TO_PROJECT_SELECTION>({
    message: 'Which project?',
    pageSize: 15,
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
      if (choices.length === 0) {
        return [backChoice];
      }

      const backIndex = Math.min(choices.length, 13);
      return [
        ...choices.slice(0, backIndex),
        new Separator(),
        backChoice,
        ...choices.slice(backIndex),
      ];
    },
  });
}

export default async function inputProject(
  client: Client,
  org: Org,
  detectedProjectName: string,
  autoConfirm = false,
  skipAutoDetect = false,
  showProjectSuggestions = false,
  allowTeamSelectionBack = false
): Promise<Project | string | typeof BACK_TO_TEAM_SELECTION> {
  const slugifiedName = slugify(detectedProjectName);

  // attempt to auto-detect a project to link
  let detectedProject = null;

  if (!skipAutoDetect) {
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

  let shouldLinkProject: boolean;

  if (showProjectSuggestions && !skipAutoDetect) {
    for (;;) {
      type ProjectPickerValue =
        | Project
        | typeof SEARCH_ALL_PROJECTS
        | typeof CREATE_NEW_PROJECT
        | typeof BACK_TO_TEAM_SELECTION;
      const choices: Array<
        | Separator
        | {
            name: string;
            value: ProjectPickerValue;
            description?: string;
          }
      > = [];

      if (detectedProject) {
        choices.push(
          {
            name: `${detectedProject.name} ${chalk.gray('(folder name)')}`,
            value: detectedProject,
          },
          new Separator()
        );
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

      const selected = await client.input.select<ProjectPickerValue>({
        message: 'Which project?',
        choices,
      });

      if (selected === BACK_TO_TEAM_SELECTION) {
        return BACK_TO_TEAM_SELECTION;
      }
      if (selected === CREATE_NEW_PROJECT) {
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
  return await promptForProjectName(
    client,
    org,
    !detectedProject ? slugifiedName : undefined
  );
}
