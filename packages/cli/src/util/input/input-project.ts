import Client from '../client';
import confirm from './confirm';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import chalk from 'chalk';
import { ProjectNotFound } from '../../util/errors-ts';
import { Project, Org } from '../../types';
import slugify from '@sindresorhus/slugify';

export default async function inputProject(
  client: Client,
  org: Org,
  detectedProjectName: string,
  autoConfirm = false
): Promise<Project | string> {
  const { output } = client;
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
    shouldLinkProject = await confirm(
      client,
      `Link to existing project?`,
      false
    );
  } else {
    // auto-detected a project to link
    if (
      await confirm(
        client,
        `Found project ${chalk.cyan(
          `“${org.slug}/${detectedProject.name}”`
        )}. Link to it?`,
        true
      )
    ) {
      return detectedProject;
    }

    // user doesn't want to link the auto-detected project
    shouldLinkProject = await confirm(
      client,
      `Link to different existing project?`,
      true
    );
  }

  if (shouldLinkProject) {
    // user wants to link a project
    let project: Project | ProjectNotFound | null = null;

    while (!project || project instanceof ProjectNotFound) {
      const answers = await client.prompt({
        type: 'input',
        name: 'existingProjectName',
        message: `What’s the name of your existing project?`,
      });
      const projectName = answers.existingProjectName as string;

      if (!projectName) {
        output.error(`Project name cannot be empty`);
        continue;
      }

      output.spinner('Verifying project name…', 1000);
      try {
        project = await getProjectByIdOrName(client, projectName, org.id);
      } finally {
        output.stopSpinner();
      }

      if (project instanceof ProjectNotFound) {
        output.error(`Project not found`);
      }
    }

    return project;
  }

  // user wants to create a new project
  let newProjectName: string | null = null;

  while (!newProjectName) {
    const answers = await client.prompt({
      type: 'input',
      name: 'newProjectName',
      message: `What’s your project’s name?`,
      default: !detectedProject ? slugifiedName : undefined,
    });
    newProjectName = answers.newProjectName as string;

    if (!newProjectName) {
      output.error(`Project name cannot be empty`);
      continue;
    }

    output.spinner('Verifying project name…', 1000);
    let existingProject: Project | ProjectNotFound;
    try {
      existingProject = await getProjectByIdOrName(
        client,
        newProjectName,
        org.id
      );
    } finally {
      output.stopSpinner();
    }

    if (existingProject && !(existingProject instanceof ProjectNotFound)) {
      output.print(`Project already exists`);
      newProjectName = null;
    }
  }

  return newProjectName;
}
