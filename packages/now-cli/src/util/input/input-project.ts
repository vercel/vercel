import Client from '../client';
import inquirer from 'inquirer';
import promptBool from './prompt-bool';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import chalk from 'chalk';
import { ProjectNotFound } from '../../util/errors-ts';
import { Output } from '../output';
import { Project, Org } from '../../types';

export default async function inputProject(
  output: Output,
  client: Client,
  org: Org,
  detectedProjectName: string
): Promise<Project | string> {
  // attempt to auto-detect a project to link
  let detectedProject = null;
  try {
    detectedProject = await getProjectByIdOrName(
      client,
      detectedProjectName,
      org.id
    );
  } catch (error) {}

  let shouldLinkProject;

  if (!detectedProject || detectedProject instanceof ProjectNotFound) {
    // did not auto-detect a project to link
    shouldLinkProject = await promptBool(`Link to existing project? [y/N]`);
  } else {
    // auto-detected a project to link
    if (
      await promptBool(
        `Found project ${chalk.cyan(
          `“${detectedProjectName}”`
        )} in your organization. Link to it? [Y/n]`
      )
    ) {
      return detectedProject;
    }

    // user doesn't want to link the auto-detected project
    shouldLinkProject = await promptBool(
      `Link to different existing project? [Y/n]`
    );
  }

  if (shouldLinkProject) {
    // user wants to link a project
    let project: Project | ProjectNotFound | null = null;

    while (!project || project instanceof ProjectNotFound) {
      const answers = await inquirer.prompt({
        type: 'input',
        name: 'existingProjectName',
        message: `What's the name of your existing project?`,
      });
      const projectName = answers.existingProjectName as string;

      project = await getProjectByIdOrName(client, projectName, org.id);

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
      message: `How would you like to call your new project?`,
    });
    newProjectName = answers.newProjectName as string;

    const existingProject = await getProjectByIdOrName(
      client,
      newProjectName,
      org.id
    );

    if (existingProject && !(existingProject instanceof ProjectNotFound)) {
      output.print(`${chalk.red('Error!')} Project already exists\n`);
      newProjectName = null;
    }
  }

  return newProjectName;
}
