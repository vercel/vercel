import type Client from '../client';
import { buildCommandWithGlobalFlags } from '../agent-output';
import { getCommandName, getCommandNamePlain, packageName } from '../pkg-name';
import type { BudgetTeam } from './api';

/**
 * Suggest a budgets command pinned to the team this mutation already resolved,
 * plus safe globals (`--cwd`, `--non-interactive`). Argv `--scope` is ignored
 * so a stale default team cannot be inspected or retried against.
 */
export function scopedBudgetCommand(
  client: Client,
  team: BudgetTeam,
  subcommand: string
): string {
  return getCommandName(scopedBudgetSubcommand(client, team, subcommand));
}

/** {@link scopedBudgetCommand} without formatting, for `printNextPageCommand`. */
export function scopedBudgetCommandPlain(
  client: Client,
  team: BudgetTeam,
  subcommand: string
): string {
  return getCommandNamePlain(scopedBudgetSubcommand(client, team, subcommand));
}

function scopedBudgetSubcommand(
  client: Client,
  team: BudgetTeam,
  subcommand: string
): string {
  const full = buildCommandWithGlobalFlags(
    client.argv,
    `--scope ${team.slug} ${subcommand}`,
    packageName,
    {
      prependGlobalFlags: true,
      excludeFlags: ['--scope', '-S', '--team', '-T'],
    }
  );
  return full.startsWith(`${packageName} `)
    ? full.slice(packageName.length + 1)
    : full;
}
