import Client from '../client';
import inquirer from 'inquirer';
import text from './text';
import getUser from '../get-user';
import getTeams from '../get-teams';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import chalk from 'chalk';
import { ProjectNotFound } from '../../util/errors-ts';
import { Output } from '../output';
import { Project } from '../../types';

export default async function selectProject(
  output: Output,
  client: Client,
  currentTeam?: string
): Promise<Project> {
  const [user, teams] = await Promise.all([getUser(client), getTeams(client)]);

  const answers = await inquirer.prompt<{
    ['org']: string;
  }>({
    name: 'org',
    type: 'list',
    message: 'Which organization contains your existing project?',
    choices: [
      { name: user.username, value: '<user>', checked: !currentTeam },
      ...teams.map(team => ({
        name: team.name || team.slug,
        value: team.id,
        checked: currentTeam && currentTeam === team.id,
      })),
    ],
  });

  const accountId = answers.org;

  let project;

  while (!project || project instanceof ProjectNotFound) {
    const projectName = await text({
      label: `${chalk.gray`?`} What's the name of your existing project?`,
      trailing: '\n',
    });

    project = await getProjectByIdOrName(client, projectName, accountId);

    if (project instanceof ProjectNotFound) {
      output.error(`Project not found`);
    }
  }

  return project;
}
