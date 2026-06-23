import type Client from '../client';
import getUser from '../get-user';
import getTeamById from '../teams/get-team-by-id';
import getTeams from '../teams/get-teams';
import type { User, Team, Org } from '@vercel-internals/types';
import chalk from 'chalk';
import output from '../../output-manager';
import { packageName } from '../pkg-name';
import { emoji } from '../emoji';
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
  autoConfirm?: boolean,
  searchable = false
): Promise<Org> {
  const {
    config: { currentTeam },
  } = client;

  if (autoConfirm && !client.nonInteractive) {
    if (currentTeam) {
      output.spinner('Loading team…', 1000);
      try {
        const team = await getTeamById(client, currentTeam);
        return { type: 'team', id: team.id, slug: team.slug };
      } catch (err) {
        output.debug(`Unable to load current team directly: ${err}`);
      } finally {
        output.stopSpinner();
      }
    }

    output.spinner('Loading user…', 1000);
    let user: User;
    try {
      user = await getUser(client);
    } finally {
      output.stopSpinner();
    }

    if (user.version !== 'northstar') {
      return { type: 'user', id: user.id, slug: user.username };
    }

    if (user.defaultTeamId) {
      output.spinner('Loading team…', 1000);
      try {
        const team = await getTeamById(client, user.defaultTeamId);
        return { type: 'team', id: team.id, slug: team.slug };
      } catch (err) {
        output.debug(`Unable to load default team directly: ${err}`);
      } finally {
        output.stopSpinner();
      }
    }
  }

  output.spinner('Loading teams…', 1000);
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
            name: `${user.name || user.email} (${user.username})${
              !currentTeam ? ` ${chalk.bold('(current)')}` : ''
            }${user.limited ? ` ${emoji('locked')}` : ''}`,
            value: { type: 'user', id: user.id, slug: user.username },
          } as const,
        ];

  const selectedTeamId =
    currentTeam || (user.version === 'northstar' ? user.defaultTeamId : null);
  const choices: Choice[] = [
    ...personalAccountChoice,
    ...teams
      .slice()
      .sort((a, b) => {
        if (a.id === selectedTeamId) return -1;
        if (b.id === selectedTeamId) return 1;
        return a.name.localeCompare(b.name);
      })
      .map<Choice>(team => {
        let name = team.name ? `${team.name} (${team.slug})` : team.slug;
        if (team.id === selectedTeamId) {
          name += ` ${chalk.bold('(current)')}`;
        }
        if (team.limited) {
          name += ` ${emoji('locked')}`;
        }
        return {
          name,
          value: { type: 'team', id: team.id, slug: team.slug },
        };
      }),
  ];

  const defaultChoiceIndex = Math.max(
    choices.findIndex(choice => choice.value.id === currentTeam),
    0
  );

  // A persisted `currentTeam` may have been inferred at login. In
  // non-interactive mode only an explicit --scope/--team is sufficient here.
  if (client.nonInteractive) {
    const explicitScope =
      getScopeOrTeamFromArgv(client.argv) || client.localConfig?.scope;
    if (explicitScope) {
      const match = choices.find(
        c => c.value.id === explicitScope || c.value.slug === explicitScope
      );
      if (match) return match.value;
    }

    const actionRequired: ActionRequiredPayload = {
      status: 'action_required',
      reason: 'missing_scope',
      message:
        choices.length > 0
          ? 'Provide --scope explicitly. No inferred default is applied in non-interactive mode.'
          : 'No teams available.',
      choices: choices.map(c => ({
        id: c.value.id,
        name: c.value.slug,
      })),
      next: choices.map(c => ({
        command: `${packageName} link --scope ${c.value.slug} --project <project-name-or-id>`,
      })),
    };
    outputActionRequired(client, actionRequired);
    process.exit(1);
  }

  if (autoConfirm) {
    return choices[defaultChoiceIndex].value;
  }

  if (!searchable) {
    return await client.input.select({
      message: question,
      choices,
      default: choices[defaultChoiceIndex].value,
    });
  }

  const defaultChoice = choices[defaultChoiceIndex];
  const initialChoices = defaultChoice
    ? [defaultChoice, ...choices.filter(choice => choice !== defaultChoice)]
    : choices;

  return await client.input.search({
    message: question,
    source: term => {
      const searchTerm = term?.trim().toLowerCase();
      if (!searchTerm) {
        return initialChoices;
      }

      return choices.filter(
        choice =>
          choice.name.toLowerCase().includes(searchTerm) ||
          choice.value.slug.toLowerCase().includes(searchTerm)
      );
    },
  });
}
