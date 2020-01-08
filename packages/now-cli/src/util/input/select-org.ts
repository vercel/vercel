import Client from '../client';
import inquirer from 'inquirer';
import getUser from '../get-user';
import getTeams from '../get-teams';
import { Org } from '../../types';

export default async function selectProject(
  question: string,
  client: Client,
  currentTeam?: string
): Promise<Org> {
  const [user, teams] = await Promise.all([getUser(client), getTeams(client)]);

  console.log(`current team: ${currentTeam}`);

  const choices: { name: string; value: Org; checked: boolean }[] = [
    {
      name: user.username,
      value: { id: user.uid, slug: user.username },
      checked: !currentTeam,
    },
    ...teams.map(team => ({
      name: team.name || team.slug,
      value: { id: team.id, slug: team.slug },
      checked: currentTeam ? currentTeam === team.id : false,
    })),
  ];

  const answers = await inquirer.prompt({
    name: 'org',
    type: 'list',
    message: question,
    choices,
  });

  const org = answers.org as Org;
  return org;
}
