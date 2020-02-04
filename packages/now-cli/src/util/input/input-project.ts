import Client from '../client';
import inquirer from 'inquirer';
import confirm from './confirm';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import chalk from 'chalk';
import { ProjectNotFound } from '../../util/errors-ts';
import { Output } from '../output';
import { Project, Org } from '../../types';
import slugify from '@sindresorhus/slugify';

export default async function inputProject(
  output: Output,
  client: Client,
  org: Org,
  detectedProjectName: string,
  autoConfirm: boolean
): Promise<Project | string> {
  if (autoConfirm) {
    return detectedProjectName;
  }

  const slugifiedName = slugify(detectedProjectName);

  // attempt to auto-detect a project to link
  let detectedProject = null;
  const existingProjectSpinner = output.spinner(
    'Searching for existing projects…',
    1000
  );
  try {
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
  } catch (error) {}
  existingProjectSpinner();

  let shouldLinkProject;

  if (!detectedProject) {
    // did not auto-detect a project to link
    shouldLinkProject = await confirm(`Link to existing project?`, false);
  } else {
    // auto-detected a project to link
    if (
      await confirm(
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
      `Link to different existing project?`,
      true
    );
  }

  if (shouldLinkProject) {
    // user wants to link a project
    let project: Project | ProjectNotFound | null = null;

    while (!project || project instanceof ProjectNotFound) {
      const answers = await inquirer.prompt({
        type: 'input',
        name: 'existingProjectName',
        message: `What’s the name of your existing project?`,
      });
      const projectName = answers.existingProjectName as string;

      if (!projectName) {
        output.error(`Project name cannot be empty`);
        continue;
      }

      const spinner = output.spinner('Verifying project name…', 1000);
      try {
        project = await getProjectByIdOrName(client, projectName, org.id);
      } finally {
        spinner();
      }

      if (project instanceof ProjectNotFound) {
        output.print(`${chalk.red('Error!')} Project not found\n`);
      }
    }

    return project;
  }

  // user wants to create a new project
  let newProjectName: string | null = null;

  while (!newProjectName) {
    const answers = await inquirer.prompt({
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

    const spinner = output.spinner('Verifying project name…', 1000);
    let existingProject: Project | ProjectNotFound;
    try {
      existingProject = await getProjectByIdOrName(
        client,
        newProjectName,
        org.id
      );
    } finally {
      spinner();
    }

    if (existingProject && !(existingProject instanceof ProjectNotFound)) {
      output.print(`${chalk.red('Error!')} Project already exists\n`);
      newProjectName = null;
    }
  }

  return newProjectName;
}
