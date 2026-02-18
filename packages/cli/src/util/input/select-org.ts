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

  // Fast path: when non-interactive and the scope is already known we only
  // need the teams list (skip getUser) to resolve the Org value.  This avoids
  // a redundant /v2/user call that the global scope resolution in index.ts
  // already made.
  if (client.nonInteractive) {
    const targetScope = currentTeam || getScopeOrTeamFromArgv(client.argv);
    if (targetScope) {
      const teams = await getTeams(client);
      const match = teams.find(
        t => t.id === targetScope || t.slug === targetScope
      );
      if (match) {
        return { type: 'team', id: match.id, slug: match.slug };
      }
      // targetScope didn't match any team — fall through to the full flow
      // so the action_required payload includes the complete choices list.
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

  // Non-interactive: the fast path above only checked teams.  If the user
  // passed --scope/--team pointing at their personal account (non-northstar),
  // currentTeam was cleared by index.ts and the fast path missed it.  Check
  // the full choices list (which includes the personal account) before giving up.
  if (client.nonInteractive) {
    const targetScope = currentTeam || getScopeOrTeamFromArgv(client.argv);
    if (targetScope) {
      const match = choices.find(
        c => c.value.id === targetScope || c.value.slug === targetScope
      );
      if (match) return match.value;
    }

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
