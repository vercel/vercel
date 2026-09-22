import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import type { Command } from '../help';
import {
  parseSubcommandArguments,
  type ParsedSubcommandArguments,
} from '../../util/command-arguments';
import {
  getGlobalFlagsFromArgs,
  getSameSubcommandSuggestionFlags,
} from '../../util/arg-common';
import { withGlobalFlags as withClientGlobalFlags } from '../../util/agent-output';

export function withGlobalFlags(
  client: Client,
  commandTemplate: string
): string {
  return withClientGlobalFlags(client, commandTemplate, {
    preserveProject: true,
  });
}

export async function parseSubcommandArgs(
  argv: string[],
  command: Command
): Promise<ParsedSubcommandArguments | number> {
  let parsedArgs;

  try {
    parsedArgs = parseSubcommandArguments(argv, command);
  } catch (err) {
    printError(err);
    return 1;
  }

  return parsedArgs;
}

export async function confirmAction(
  client: Client,
  skipConfirmation: boolean,
  message: string,
  details?: string
): Promise<boolean> {
  if (skipConfirmation) return true;

  if (details) {
    output.print(`  ${details}\n`);
  }

  return await client.input.confirm(message, false);
}

export function isValidUrl(url: string): boolean {
  if (url.startsWith('/')) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Slice argv after `vercel` (i.e. client.argv.slice(2)) starting after the
 * given redirects subcommand name.
 */
export function getArgsAfterRedirectsSubcommand(
  fullArgs: string[],
  subcommand: string
): string[] {
  const idx = fullArgs.indexOf(subcommand);
  return idx >= 0 ? fullArgs.slice(idx + 1) : [];
}

/**
 * Returns only global/safe flags from args after a redirects subcommand.
 * Use for suggested `redirects list` / `redirects list-versions` commands.
 */
export function getRedirectGlobalFlagsOnly(
  afterSubcommandArgs: string[]
): string[] {
  return getGlobalFlagsFromArgs(afterSubcommandArgs, {
    preserveProject: true,
  });
}

/**
 * Global flags plus --yes for suggested `redirects promote` commands.
 */
export function getRedirectPromoteSuggestionFlags(
  afterSubcommandArgs: string[]
): string[] {
  const parts = getRedirectGlobalFlagsOnly(afterSubcommandArgs);
  if (!parts.some(p => p === '--yes' || p === '-y')) {
    parts.push('--yes');
  }
  return parts;
}

/**
 * Builds flag parts for suggested redirects commands (e.g. missing args or confirm).
 * Uses args after the given subcommand, keeps only flags, and optionally ensures --yes.
 * Use when building next[] commands like `redirects upload <file> ...` or `redirects add <source> <dest> ...`.
 */
export function buildRedirectsSuggestionFlags(
  fullArgs: string[],
  subcommand: string,
  options: { ensureYes?: boolean } = {}
): string[] {
  const after = getArgsAfterRedirectsSubcommand(fullArgs, subcommand);
  const flagParts = getSameSubcommandSuggestionFlags(after);
  if (
    options.ensureYes !== false &&
    !flagParts.some(a => a === '--yes' || a === '-y')
  ) {
    flagParts.push('--yes');
  }
  return flagParts;
}
