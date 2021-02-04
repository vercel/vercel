import Client from '../client';
import inquirer from 'inquirer';
import getUser from '../get-user';
import getTeams from '../get-teams';
import { User, Team, Org } from '../../types';
import { Output } from '../output';

type Choice = { name: string; value: Org };

export default async function selectOrg(
  output: Output,
  question: string,
  client: Client,
  currentTeam?: string,
  autoConfirm?: boolean
): Promise<Org> {
  require('./patch-inquirer');

  output.spinner('Loading scopes…', 1000);
  let user: User;
  let teams: Team[];
  try {
    [user, teams] = await Promise.all([getUser(client), getTeams(client)]);
  } finally {
    output.stopSpinner();
  }

  const choices: Choice[] = [
    {
      name: user.name || user.username,
      value: { type: 'user', id: user.uid, slug: user.username },
    },
    ...teams.map<Choice>(team => ({
      name: team.name || team.slug,
      value: { type: 'team', id: team.id, slug: team.slug },
    })),
  ];

  const defaultOrgIndex = teams.findIndex(team => team.id === currentTeam) + 1;

  if (autoConfirm) {
    return choices[defaultOrgIndex].value;
  }

  const answers = await inquirer.prompt({
    type: 'list',
    name: 'org',
    message: question,
    choices,
    default: defaultOrgIndex,
  });

  const org = answers.org;
  return org;
}
