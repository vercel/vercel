import type Client from '../client';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import chalk from 'chalk';
import { ProjectNotFound } from '../../util/errors-ts';
import type { Project, Org } from '@vercel-internals/types';
import slugify from '@sindresorhus/slugify';
import output from '../../output-manager';

export default async function inputProject(
  client: Client,
  org: Org,
  detectedProjectName: string,
  autoConfirm = false
): Promise<Project | string> {
  const slugifiedName = slugify(detectedProjectName);

  // attempt to auto-detect a project to link
  let detectedProject = null;
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

  if (autoConfirm) {
    return detectedProject || detectedProjectName;
  }

  let shouldLinkProject;

  if (!detectedProject) {
    // did not auto-detect a project to link
    shouldLinkProject = await client.input.confirm(
      `Link to existing project?`,
      false
    );
  } else {
    // auto-detected a project to link
    if (
      await client.input.confirm(
        `Found project ${chalk.cyan(
          `“${org.slug}/${detectedProject.name}”`
        )}. Link to it?`,
        true
      )
    ) {
      return detectedProject;
    }

    // user doesn't want to link the auto-detected project
    shouldLinkProject = await client.input.confirm(
      `Link to different existing project?`,
      true
    );
  }

  if (shouldLinkProject) {
    const firstPage = await client.fetch<{
      projects: Project[];
      pagination: { count: number; next: number | null };
    }>(`/v9/projects?limit=100`, { accountId: org.id });
    const projects = firstPage.projects;
    const hasMoreProjects = firstPage.pagination.next !== null;

    if (projects.length === 0) {
      output.log(
        `No existing projects found under ${chalk.bold(org.slug)}. Creating new project.`
      );
    } else if (hasMoreProjects) {
      let toLink: Project;
      await client.input.text({
        message: "What's the name of your existing project?",
        validate: async val => {
          if (!val) {
            return 'Project name cannot be empty';
          }
          const project = await getProjectByIdOrName(client, val, org.id);
          if (project instanceof ProjectNotFound) {
            return 'Project not found';
          }
          toLink = project;
          return true;
        },
      });
      return toLink!;
    } else {
      const choices = projects
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(project => ({
          name: project.name,
          value: project,
        }));

      const toLink = await client.input.select<Project>({
        message: 'Which existing project do you want to link?',
        choices,
      });

      return toLink;
    }
  }

  // user wants to create a new project
  return await client.input.text({
    message: `What’s your project’s name?`,
    default: !detectedProject ? slugifiedName : undefined,
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
