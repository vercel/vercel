import type Client from '../client';
import getUser from '../get-user';
import getTeams from '../teams/get-teams';
import type { User, Team, Org } from '@vercel-internals/types';
import output from '../../output-manager';
import { packageName } from '../pkg-name';
import {
  outputActionRequired,
  type ActionRequiredPayload,
} from '../agent-output';

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

  // Non-interactive: when multiple choices and no default, return action_required so caller can output JSON and exit
  if (client.nonInteractive && choices.length > 1 && !currentTeam) {
    const actionRequired: ActionRequiredPayload = {
      status: 'action_required',
      reason: 'missing_scope',
      message: 'Multiple teams available. Provide --team or --scope.',
      choices: choices.map(c => ({
        id: c.value.id,
        name: c.value.slug,
      })),
      next: choices.map(c => ({
        command: `${packageName} link --scope ${c.value.slug}`,
      })),
    };
    outputActionRequired(client, actionRequired);
    process.exit(1);
  }

  if (autoConfirm) {
    return choices[defaultChoiceIndex].value;
  }

  return await client.input.select({
    message: question,
    choices,
    default: choices[defaultChoiceIndex].value,
  });
}
