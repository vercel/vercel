import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import type { Command } from '../help';
import {
  GLOBAL_CLI_FLAG_NAMES,
  globalCliFlagTakesValue,
} from '../../util/arg-common';

export interface ParsedSubcommand {
  args: string[];
  flags: { [key: string]: any };
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

export async function ensureProjectLink(client: Client) {
  const link = await getLinkedProject(client);

  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const linkCmd = getCommandNamePlain('link');
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          message: `Your codebase isn't linked to a project on Vercel. Run ${linkCmd} to begin.`,
          next: [{ command: linkCmd }],
        },
        1
      );
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  return link;
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
 * Flags that belong only to redirects add/upload/remove. Forwarding them into
 * suggested `redirects list`, `redirects promote`, or `redirects list-versions`
 * commands causes parse errors for agents.
 */
const REDIRECTS_SUBCOMMAND_EXCLUSIVE_FLAGS = new Set([
  '--status',
  '--case-sensitive',
  '--preserve-query-params',
  '--name',
  '--overwrite',
]);

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
  const out: string[] = [];
  for (let i = 0; i < afterSubcommandArgs.length; i++) {
    const a = afterSubcommandArgs[i];
    if (!a.startsWith('-')) continue;

    let name = a;
    const hasEq = a.includes('=');
    if (hasEq) {
      name = a.slice(0, a.indexOf('='));
    }

    if (REDIRECTS_SUBCOMMAND_EXCLUSIVE_FLAGS.has(name)) {
      if (
        !hasEq &&
        (name === '--status' || name === '--name') &&
        i + 1 < afterSubcommandArgs.length &&
        !afterSubcommandArgs[i + 1].startsWith('-')
      ) {
        i++;
      }
      continue;
    }

    if (!GLOBAL_CLI_FLAG_NAMES.has(name)) {
      continue;
    }

    out.push(a);
    if (!hasEq && globalCliFlagTakesValue(name)) {
      if (
        i + 1 < afterSubcommandArgs.length &&
        !afterSubcommandArgs[i + 1].startsWith('-')
      ) {
        out.push(afterSubcommandArgs[++i]);
      }
    }
  }
  return out;
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
  const flagParts = after.filter(a => a.startsWith('-'));
  if (
    options.ensureYes !== false &&
    !flagParts.some(a => a === '--yes' || a === '-y')
  ) {
    flagParts.push('--yes');
  }
  return flagParts;
}
