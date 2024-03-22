import Client from '../client';
import getUser from '../get-user';
import getTeams from '../teams/get-teams';
import { User, Team, Org } from '@vercel-internals/types';

type Choice = { name: string; value: Org };

export default async function selectOrg(
  client: Client,
  question: string,
  autoConfirm?: boolean
): Promise<Org> {
  require('./patch-inquirer');
  const {
    output,
    config: { currentTeam },
  } = client;

  output.spinner('Loading scopes…', 1000);
  let user: User;
  let teams: Team[];
  try {
    [user, teams] = await Promise.all([getUser(client), getTeams(client)]);
  } finally {
    output.stopSpinner();
  }

  const personalAccountChoice =
    user.version === 'northstar'
      ? []
      : [
          {
            name: user.name || user.username,
            value: { type: 'user', id: user.id, slug: user.username },
          } as const,
        ];

  const choices: Choice[] = [
    ...personalAccountChoice,
    ...teams.map<Choice>(team => ({
      name: team.name || team.slug,
      value: { type: 'team', id: team.id, slug: team.slug },
    })),
  ];

  const defaultChoiceIndex = Math.max(
    choices.findIndex(choice => choice.value.id === currentTeam),
    0
  );

  if (autoConfirm) {
    return choices[defaultChoiceIndex].value;
  }

  return await client.select({
    message: question,
    choices,
    default: choices[defaultChoiceIndex].value,
  });
}
