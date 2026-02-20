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

function getScopeOrTeamFromArgv(argv: string[]): string | null {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--scope' || arg === '--team' || arg === '-S' || arg === '-T') {
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('-')) {
        return next;
      }
      continue;
    }
    if (arg.startsWith('--scope=')) {
      return arg.slice('--scope='.length);
    }
    if (arg.startsWith('--team=')) {
      return arg.slice('--team='.length);
    }
  }
  return null;
}

export default async function selectOrg(
  client: Client,
  question: string,
  autoConfirm?: boolean
): Promise<Org> {
  const {
    config: { currentTeam },
  } = client;

  // Non-interactive fast path: when the scope is already known, try to
  // resolve from teams alone (skip getUser).  This avoids a redundant
  // /v2/user round-trip that the global scope resolution in index.ts
  // already performed.
  if (client.nonInteractive) {
    const targetScope = currentTeam || getScopeOrTeamFromArgv(client.argv);
    if (targetScope) {
      const teams = await getTeams(client);
      const teamMatch = teams.find(
        t => t.id === targetScope || t.slug === targetScope
      );
      if (teamMatch) {
        return { type: 'team', id: teamMatch.id, slug: teamMatch.slug };
      }

      // Scope didn't match a team — it may be a personal account
      // (non-northstar).  Fetch user to check before falling through to
      // the action_required error.
      const user = await getUser(client);
      if (
        user.version !== 'northstar' &&
        (user.id === targetScope ||
          user.email === targetScope ||
          user.username === targetScope)
      ) {
        return { type: 'user', id: user.id, slug: user.username };
      }

      // Scope is invalid — build the full choices list for the error payload
      const choices = buildChoices(user, teams);
      outputMissingScopeError(client, choices);
      process.exit(1);
    }
  }

  output.spinner('Loading scopes…', 1000);
  let user: User;
  let teams: Team[];
  try {
    [user, teams] = await Promise.all([getUser(client), getTeams(client)]);
  } finally {
    output.stopSpinner();
  }

  const choices = buildChoices(user, teams);

  const defaultChoiceIndex = Math.max(
    choices.findIndex(choice => choice.value.id === currentTeam),
    0
  );

  // Non-interactive without a target scope: output choices and exit
  if (client.nonInteractive) {
    outputMissingScopeError(client, choices);
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

function buildChoices(user: User, teams: Team[]): Choice[] {
  const personalAccountChoice =
    user.version === 'northstar'
      ? []
      : [
          {
            name: user.name || user.username,
            value: { type: 'user', id: user.id, slug: user.username },
          } as const,
        ];

  return [
    ...personalAccountChoice,
    ...teams
      .sort(a => (a.id === user.defaultTeamId ? -1 : 1))
      .map<Choice>(team => ({
        name: team.name || team.slug,
        value: { type: 'team', id: team.id, slug: team.slug },
      })),
  ];
}

function outputMissingScopeError(client: Client, choices: Choice[]): void {
  const actionRequired: ActionRequiredPayload = {
    status: 'action_required',
    reason: 'missing_scope',
    message:
      choices.length > 0
        ? 'Provide --scope or --team explicitly. No default is applied in non-interactive mode.'
        : 'No scopes available.',
    choices: choices.map(c => ({
      id: c.value.id,
      name: c.value.slug,
    })),
    next: choices.map(c => ({
      command: `${packageName} link --scope ${c.value.slug}`,
    })),
  };
  outputActionRequired(client, actionRequired);
}
