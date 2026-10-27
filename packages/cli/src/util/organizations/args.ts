import chalk from 'chalk';
import { z } from 'zod';
import output from '../../output-manager';
import type Client from '../client';
import { getGlobalFlagsFromArgs } from '../arg-common';
import { validateJsonOutput } from '../output-format';
import { parseListLimit } from '../pagination';
import { type ListPosition, decodeListCursor } from './pagination';
import { getCommandName, getCommandNamePlain } from '../pkg-name';
import { outputActionRequired, outputAgentError } from '../agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../agent-output-constants';

/** A validated value, or the exit code the caller returns. */
export type Validated<T> =
  | { status: 'ok'; value: T }
  | { status: 'error'; exitCode: number };

// Bounded like every other input, so an oversized value fails locally instead
// of building a request path the edge rejects.
export const idSchema = z
  .string()
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const slugSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
export const nameSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(value => value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value));
export const billingPlanSchema = z.enum(['platform', 'enterprise']);

// A slug can't hold underscores, so a prefix tells an ID from a slug. Mirrors
// `teamRefBody` in `vcr permissions`.
export const ORGANIZATION_ID_PREFIX = 'org_';
export const TEAM_ID_PREFIX = 'team_';

/**
 * Checks an ID that must carry `prefix`. A bare prefix names nothing, so it
 * fails here instead of at the API.
 */
export function isPrefixedId(value: string, prefix: string): boolean {
  return (
    value.startsWith(prefix) &&
    value.length > prefix.length &&
    idSchema.safeParse(value).success
  );
}

export const SLUG_MESSAGE =
  'Provide --slug with 1-48 lowercase letters, numbers, or hyphens, beginning and ending with a letter or number.';
export const NAME_MESSAGE =
  'Provide --name with 1-256 characters and no control characters.';
export const PLAN_MESSAGE =
  'Use --billing-plan platform or --billing-plan enterprise.';

/**
 * Suggested `organizations` command with the caller's global flags (`--scope`,
 * `--token`, …) preserved so the next command runs in the same context.
 */
export function organizationsSuggestion(
  subcommand: string,
  argv: string[]
): string {
  const globalFlags = getGlobalFlagsFromArgs(argv.slice(2));
  const full = globalFlags.length
    ? `${subcommand} ${globalFlags.join(' ')}`
    : subcommand;
  return getCommandNamePlain(full);
}

/**
 * Reports an argument the caller must supply. Non-interactive callers get the
 * exact command to run instead of a prompt. The caller can add the argument
 * itself, so a human doesn't need to act.
 */
export function missingArgument(
  client: Client,
  options: {
    reason: string;
    message: string;
    /** Usage template, e.g. `organizations inspect <organization-id>`. */
    usage: string;
    /** True when the missing input is the organization, which `list` finds. */
    suggestList?: boolean;
  }
): number {
  const next: Array<{ command: string; when?: string }> = [];

  if (options.suggestList) {
    next.push({
      command: organizationsSuggestion('organizations list', client.argv),
      when: 'List organizations to find an ID',
    });
  }

  next.push({ command: organizationsSuggestion(options.usage, client.argv) });

  outputActionRequired(client, {
    status: AGENT_STATUS.ACTION_REQUIRED,
    action: AGENT_ACTION.MISSING_ARGUMENTS,
    reason: options.reason,
    message: options.message,
    next,
  });
  output.error(options.message);
  output.log(`Usage: ${chalk.cyan(getCommandName(options.usage))}`);
  return getExitCodeForReason(options.reason);
}

/** Reports an argument or flag value the command cannot use. */
export function invalidArgument(client: Client, message: string): number {
  outputAgentError(client, {
    status: AGENT_STATUS.ERROR,
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    message,
  });
  output.error(message);
  return 2;
}

/** Reports extra positional arguments the subcommand can't interpret. */
export function invalidArgumentCount(client: Client, usage: string): number {
  const message = `Too many arguments. Usage: ${getCommandNamePlain(usage)}`;
  outputAgentError(client, {
    status: AGENT_STATUS.ERROR,
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    message,
  });
  output.error(
    `Invalid number of arguments. Usage: ${chalk.cyan(getCommandName(usage))}`
  );
  return 2;
}

/**
 * Validates one required value. A missing value reports as an action the caller
 * must take; a present but malformed value reports as an invalid argument.
 */
export function validate<T>(
  client: Client,
  schema: z.ZodType<T>,
  value: unknown,
  options: { message: string; usage: string }
): Validated<T> {
  if (value === undefined) {
    return {
      status: 'error',
      exitCode: missingArgument(client, {
        ...options,
        reason: AGENT_REASON.MISSING_ARGUMENTS,
      }),
    };
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      status: 'error',
      exitCode: invalidArgument(client, options.message),
    };
  }
  return { status: 'ok', value: parsed.data };
}

/** Validates an optional flag. An absent flag is valid and yields `undefined`. */
export function validateOptional<T>(
  client: Client,
  schema: z.ZodType<T>,
  value: unknown,
  message: string
): Validated<T | undefined> {
  if (value === undefined) return { status: 'ok', value: undefined };
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { status: 'error', exitCode: invalidArgument(client, message) };
  }
  return { status: 'ok', value: parsed.data };
}

/**
 * Reads the output format. An unsupported value reports like any other invalid
 * flag, so a non-interactive caller gets JSON instead of prose on stderr only.
 *
 * @returns true when stdout carries JSON.
 */
export function outputFormat(
  client: Client,
  flags: { '--format'?: string; '--json'?: boolean }
): Validated<boolean> {
  const format = validateJsonOutput(flags);
  if (!format.valid) {
    return { status: 'error', exitCode: invalidArgument(client, format.error) };
  }
  return { status: 'ok', value: format.jsonOutput };
}

/** Rejects positional arguments on subcommands that take none. */
export function noArguments(
  client: Client,
  args: string[],
  usage: string
): Validated<undefined> {
  if (args.length) {
    return { status: 'error', exitCode: invalidArgumentCount(client, usage) };
  }
  return { status: 'ok', value: undefined };
}

/**
 * Reports a subcommand the group does not have, as a usage error that points
 * to the group's help.
 */
export function unknownCommand(
  client: Client,
  group: string,
  segment: string | undefined
): number {
  const path = getCommandNamePlain(group);
  const message = segment
    ? `Unknown command ${segment} for ${path}.`
    : `Missing command for ${path}.`;
  // Both reasons are usage errors, so `getExitCodeForReason` exits 2.
  outputAgentError(client, {
    status: AGENT_STATUS.ERROR,
    reason: segment ? 'unknown_command' : 'missing_command',
    message,
    next: [{ command: `${path} --help`, when: 'See all commands' }],
  });
  output.error(message);
  output.log(`\n  See all commands:\n    ${path} --help`);
  return 2;
}

/**
 * Reads `--limit` and `--next` for a list. The cursor is the CLI's own, so a
 * value that does not decode is a usage error before any request.
 */
export function listWindow(
  client: Client,
  flags: { '--limit'?: number; '--next'?: string }
): Validated<{ limit: number; start: ListPosition }> {
  let limit: number;
  try {
    limit = parseListLimit(flags['--limit']);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', exitCode: invalidArgument(client, message) };
  }

  const next = flags['--next'];
  if (next === undefined) {
    return { status: 'ok', value: { limit, start: { offset: 0 } } };
  }

  const start = decodeListCursor(next);
  if (!start) {
    return {
      status: 'error',
      exitCode: invalidArgument(
        client,
        'Provide --next with the cursor from the previous page.'
      ),
    };
  }
  return { status: 'ok', value: { limit, start } };
}
