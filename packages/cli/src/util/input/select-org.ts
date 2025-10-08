import type Client from '../client';
import getUser from '../get-user';
import getTeams from '../teams/get-teams';
import type { User, Team, Org } from '@vercel-internals/types';
import output from '../../output-manager';

type Choice = { name: string; value: Org };

export default async function selectOrg(
  client: Client,
  question: string,
  autoConfirm?: boolean
): Promise<Org> {
  const {
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
    ...teams
      .sort(a => (a.id === user.defaultTeamId ? -1 : 1))
      .map<Choice>(team => ({
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

  return await client.input.select({
    message: question,
    choices,
    default: choices[defaultChoiceIndex].value,
  });
}
