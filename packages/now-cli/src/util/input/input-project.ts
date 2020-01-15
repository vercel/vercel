import Client from '../client';
import inquirer from 'inquirer';
import confirm from './confirm';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import chalk from 'chalk';
import { ProjectNotFound } from '../../util/errors-ts';
import { Output } from '../output';
import { Project, Org } from '../../types';
import wait from '../output/wait';

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

  // attempt to auto-detect a project to link
  let detectedProject = null;
  const existingProjectSpinner = wait('Searching for existing projects…', 1000);
  try {
    detectedProject = await getProjectByIdOrName(
      client,
      detectedProjectName,
      org.id
    );
  } catch (error) {}
  existingProjectSpinner();

  let shouldLinkProject;

  if (!detectedProject || detectedProject instanceof ProjectNotFound) {
    // did not auto-detect a project to link
    shouldLinkProject = await confirm(`Link to existing project?`, false);
  } else {
    // auto-detected a project to link
    if (
      await confirm(
        `Found project ${chalk.cyan(
          `“${org.slug}/${detectedProjectName}”`
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

      const loader = wait('Verifying project name…', 1000);
      project = await getProjectByIdOrName(client, projectName, org.id);
      loader();

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
    });
    newProjectName = answers.newProjectName as string;

    const spinner = wait('Verifying project name…', 1000);
    const existingProject = await getProjectByIdOrName(
      client,
      newProjectName,
      org.id
    );
    spinner();

    if (existingProject && !(existingProject instanceof ProjectNotFound)) {
      output.print(`${chalk.red('Error!')} Project already exists\n`);
      newProjectName = null;
    }
  }

  return newProjectName;
}
