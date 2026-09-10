import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../client';
import { getGlobalFlagsFromArgs } from '../arg-common';
import { getCommandName, getCommandNamePlain } from '../pkg-name';
import { outputAgentError } from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';

/**
 * Suggested `kms` command with the caller's global flags (`--cwd`, `--scope`,
 * …) preserved so the next command runs in the same context.
 */
export function kmsSuggestion(subcommand: string, argv: string[]): string {
  const globalFlags = getGlobalFlagsFromArgs(argv.slice(2));
  const full = globalFlags.length
    ? `${subcommand} ${globalFlags.join(' ')}`
    : subcommand;
  return getCommandNamePlain(full);
}

/**
 * Reports a missing positional argument. Non-interactive callers get the exact
 * command to run instead of a prompt.
 */
export function missingArgument(
  client: Client,
  options: {
    reason: string;
    message: string;
    /** Usage template, e.g. `kms inspect <issuerId>`. */
    usage: string;
  }
): number {
  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: options.reason,
      message: options.message,
      next: [
        {
          command: kmsSuggestion('kms ls', client.argv),
          when: 'List issuers to find an ID',
        },
        { command: kmsSuggestion(options.usage, client.argv) },
      ],
    },
    1
  );
  output.error(options.message);
  output.log(`Usage: ${chalk.cyan(getCommandName(options.usage))}`);
  return 1;
}

/** Reports extra positional arguments the subcommand can't interpret. */
export function invalidArgumentCount(client: Client, usage: string): number {
  const message = `Too many arguments. Usage: ${getCommandNamePlain(usage)}`;
  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
    },
    1
  );
  output.error(
    `Invalid number of arguments. Usage: ${chalk.cyan(getCommandName(usage))}`
  );
  return 1;
}

/** Reports a local input failure (bad JSON, unreadable file) uniformly. */
export function invalidInput(client: Client, message: string): number {
  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
    },
    1
  );
  output.error(message);
  return 1;
}
