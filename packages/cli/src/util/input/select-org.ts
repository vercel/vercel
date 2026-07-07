import chalk from 'chalk';
import type Client from '../client';
import getUser from '../get-user';
import getTeams from '../teams/get-teams';
import type { User, Team, Org } from '@vercel-internals/types';
import { getPlatformEnv } from '@vercel/build-utils';
import { emoji } from '../emoji';
import output from '../../output-manager';
import param from '../output/param';
import { printAlignedLabel } from '../output/print-aligned-label';
import { getCommandName, packageName } from '../pkg-name';
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
  searchable = false,
  /** Filled with resolution details for callers that adjust follow-up UI. */
  meta?: { choiceCount?: number }
): Promise<Org> {
  const {
    config: { currentTeam },
  } = client;

  output.spinner('Loading teams…', 1000);
  let user: User;
  let teams: Team[];
  try {
    [user, teams] = await Promise.all([getUser(client), getTeams(client)]);
  } finally {
    output.stopSpinner();
  }

  // Match the `vc switch` label format: `Name (slug)` plus a bold `(current)`
  // marker and a lock for teams that require SSO.
  const formatChoiceName = (
    name: string,
    slug: string,
    isCurrent: boolean,
    limited: boolean | undefined
  ): string => {
    let title = `${name} (${slug})`;
    if (isCurrent) {
      title += ` ${chalk.bold('(current)')}`;
    }
    if (limited) {
      title += ` ${emoji('locked')}`;
    }
    return title;
  };

  const personalAccountChoice =
    user.version === 'northstar'
      ? []
      : [
          {
            name: formatChoiceName(
              user.name || user.username,
              user.username,
              !currentTeam,
              user.limited
            ),
            value: { type: 'user', id: user.id, slug: user.username },
          } as const,
        ];

  const choices: Choice[] = [
    ...personalAccountChoice,
    ...teams
      .sort(a => (a.id === user.defaultTeamId ? -1 : 1))
      .map<Choice>(team => ({
        name: formatChoiceName(
          team.name || team.slug,
          team.slug,
          team.id === currentTeam,
          team.limited
        ),
        value: { type: 'team', id: team.id, slug: team.slug },
      })),
  ];

  const defaultChoiceIndex = Math.max(
    choices.findIndex(choice => choice.value.id === currentTeam),
    0
  );

  if (meta) {
    meta.choiceCount = choices.length;
  }

  // An explicit signal — `--scope`/`--team`, `vercel.json` `scope`,
  // `VERCEL_ORG_ID` — selects the team directly. The globally selected team
  // (`vc switch`, login default) is a guess, not a signal, and must not
  // silently decide where a project gets linked.
  const localConfigScope = client.localConfig?.scope;
  const explicitScope =
    getScopeOrTeamFromArgv(client.argv) ??
    (typeof localConfigScope === 'string' ? localConfigScope : null) ??
    getPlatformEnv('ORG_ID') ??
    null;
  const matchExplicitScope = (): Org | undefined => {
    if (!explicitScope) return undefined;
    const match = choices.find(
      c => c.value.id === explicitScope || c.value.slug === explicitScope
    );
    if (match) return match.value;

    // An explicit scope naming the user (id/email/username) resolves to the
    // personal account when one is available (non-Northstar users).
    if (
      user.id === explicitScope ||
      user.email === explicitScope ||
      user.username === explicitScope
    ) {
      return choices.find(c => c.value.type === 'user')?.value;
    }
    return undefined;
  };

  // Strict resolution when prompting is impossible (non-interactive mode or
  // no TTY): only an explicit signal or a single unambiguous choice selects
  // a team.
  if (client.nonInteractive || !client.stdin.isTTY) {
    const match = matchExplicitScope();
    if (match) return match;

    if (choices.length === 1) {
      return choices[0].value;
    }

    const actionRequired: ActionRequiredPayload = {
      status: 'action_required',
      reason: 'missing_scope',
      message:
        choices.length > 0
          ? 'Provide --team or --scope explicitly. No default is applied in non-interactive mode.'
          : 'No teams available.',
      choices: choices.map(c => ({
        id: c.value.id,
        name: c.value.slug,
      })),
      next: choices.map(c => ({
        command: `${packageName} link --team ${c.value.slug}`,
      })),
    };
    // Emits JSON and exits in non-interactive mode; no-op otherwise.
    outputActionRequired(client, actionRequired);
    output.error(
      choices.length > 0
        ? `Multiple teams found. Teams are never auto-selected when the CLI runs without an interactive terminal. Re-run this command with ${param(
            '--team <slug>'
          )}, or run ${getCommandName('teams ls')} to list your teams.`
        : 'No teams available.'
    );
    process.exit(1);
  }

  // An explicit signal answers the team question without prompting. The team
  // is never guessed from the globally selected team — with multiple choices
  // and no signal, ask (even under `--yes`, which answers confirmations, not
  // data questions).
  const explicitOrg = matchExplicitScope();
  if (explicitOrg) {
    return explicitOrg;
  }

  // A single choice is unambiguous: skip the prompt and show the resolved
  // team as state instead. Prompts are for decisions, rows are for facts.
  if (choices.length === 1) {
    printAlignedLabel('Team', choices[0].value.slug);
    return choices[0].value;
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

  const pageSize = 15;
  const countHint =
    choices.length > pageSize
      ? ` ${chalk.dim(`(${choices.length} teams)`)}`
      : '';

  return await client.input.search<Org>({
    message: `${question}${countHint}`,
    pageSize,
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
