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

type ProjectDecision = 'create' | 'existing';
const SEARCH_ALL_PROJECTS = 'search-all-projects' as const;
const CREATE_NEW_PROJECT = 'create-new-project' as const;

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

export default async function inputProject(
  client: Client,
  org: Org,
  detectedProjectName: string,
  autoConfirm = false,
  skipAutoDetect = false,
  showProjectSuggestions = false
): Promise<Project | string> {
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
  let useDetectedNameAsDefault = false;

  if (showProjectSuggestions && !skipAutoDetect) {
    const selected = await client.input.select<
      Project | typeof SEARCH_ALL_PROJECTS | typeof CREATE_NEW_PROJECT
    >({
      message: 'Which project?',
      choices: [
        ...(detectedProject
          ? [
              {
                name: `${detectedProject.name} ${chalk.gray('(folder name)')}`,
                value: detectedProject,
              },
              new Separator(),
            ]
          : []),
        {
          name: 'Search all projects',
          value: SEARCH_ALL_PROJECTS,
          description: 'Browse or search every project in this team',
        },
        {
          name: 'Create a new project',
          value: CREATE_NEW_PROJECT,
          description: `Create it under ${org.slug}`,
        },
      ],
    });

    if (selected === CREATE_NEW_PROJECT) {
      shouldLinkProject = false;
      useDetectedNameAsDefault = true;
    } else if (selected !== SEARCH_ALL_PROJECTS) {
      return selected;
    } else {
      shouldLinkProject = true;
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
    } else {
      return await client.input.search<Project>({
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

          return matchingProjects
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(project => ({
              name: project.name,
              value: project,
            }));
        },
      });
    }
  }

  // user wants to create a new project
  return await client.input.text({
    message: 'Name?',
    default:
      useDetectedNameAsDefault || !detectedProject ? slugifiedName : undefined,
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
