import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import type { Command } from '../help';
import { ensureProjectLink as ensureProjectLinkForCommand } from '../../util/projects/ensure-project-link';
import {
  getCommandNameWithGlobalFlagsAndProject,
  getGlobalFlagsAndProjectFromArgs,
} from '../../util/arg-common';

export interface ParsedSubcommand {
  args: string[];
  flags: { [key: string]: any };
}

export function withGlobalFlags(
  client: Client,
  commandTemplate: string
): string {
  return getCommandNameWithGlobalFlagsAndProject(commandTemplate, client.argv);
}

export async function parseSubcommandArgs(
  argv: string[],
  command: Command
): Promise<ParsedSubcommand | number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(command.options);

  try {
    // @ts-expect-error - TypeScript complains about the flags specification type
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  return parsedArgs;
}

export function validateRequiredArgs(
  args: string[],
  required: string[]
): string | null {
  for (let i = 0; i < required.length; i++) {
    if (!args[i]) {
      return `Missing required argument: ${required[i]}`;
    }
  }
  return null;
}

export function ensureProjectLink(client: Client, projectName?: string) {
  return ensureProjectLinkForCommand({
    client,
    commandName: 'redirects',
    projectName,
  });
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
  return getGlobalFlagsAndProjectFromArgs(afterSubcommandArgs);
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
  const flagParts: string[] = [];
  for (let i = 0; i < after.length; i++) {
    if (!after[i].startsWith('-')) continue;
    flagParts.push(after[i]);
    if (
      after[i] === '--project' &&
      i + 1 < after.length &&
      !after[i + 1].startsWith('-')
    ) {
      flagParts.push(after[++i]);
    }
  }
  if (
    options.ensureYes !== false &&
    !flagParts.some(a => a === '--yes' || a === '-y')
  ) {
    flagParts.push('--yes');
  }
  return flagParts;
}
