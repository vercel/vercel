import Client from '../client';
import prompts from 'prompts';
import getUser from '../get-user';
import getTeams from '../get-teams';
import { Org } from '../../types';

type Choice = { title: string; value: Org };

export default async function selectProject(
  question: string,
  client: Client,
  currentTeam?: string
): Promise<Org> {
  const [user, teams] = await Promise.all([getUser(client), getTeams(client)]);

  const choices: Choice[] = [
    {
      title: user.name || user.username,
      value: { type: 'user', id: user.uid, slug: user.username },
    },
    ...teams.map<Choice>(team => ({
      title: team.name || team.slug,
      value: { type: 'team', id: team.id, slug: team.slug },
    })),
  ];

  const answers = await prompts({
    type: 'select',
    name: 'org',
    message: question,
    choices,
    initial: teams.findIndex(team => team.id === currentTeam) + 1,
  });

  const org = answers.org;
  return org;
}
