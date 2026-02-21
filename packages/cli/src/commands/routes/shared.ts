import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import type { Command } from '../help';

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

export async function ensureProjectLink(client: Client) {
  const link = await getLinkedProject(client);

  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
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

/**
 * Formats a has/missing condition for display.
 * Output: [type] key = value  (or [type] value for host, or [type] key for existence checks)
 */
export function formatCondition(condition: {
  type: string;
  key?: string;
  value?: unknown;
}): string {
  const parts = [chalk.gray(`[${condition.type}]`)];

  if (condition.key) {
    parts.push(chalk.cyan(condition.key));
  }

  if (condition.value !== undefined) {
    const formatted =
      typeof condition.value === 'string'
        ? condition.value
        : JSON.stringify(condition.value);
    parts.push(`= ${formatted}`);
  }

  return parts.join(' ');
}

/**
 * Display labels for transform types.
 */
export const TRANSFORM_TYPE_LABELS: Record<string, string> = {
  'request.headers': 'Request Header',
  'request.query': 'Request Query',
  'response.headers': 'Response Header',
};

/**
 * Display labels for transform operations.
 */
const TRANSFORM_OP_LABELS: Record<string, string> = {
  set: 'set',
  append: 'append',
  delete: 'delete',
};

/**
 * Formats a single transform for display.
 * Output: [Request Header] set X-Custom = "value"
 *         [Response Header] delete X-Powered-By
 */
export function formatTransform(transform: {
  type: string;
  op: string;
  target: { key: string | Record<string, unknown> };
  args?: string | string[];
}): string {
  const typeLabel = TRANSFORM_TYPE_LABELS[transform.type] ?? transform.type;
  const opLabel = TRANSFORM_OP_LABELS[transform.op] ?? transform.op;

  const key =
    typeof transform.target.key === 'string'
      ? transform.target.key
      : JSON.stringify(transform.target.key);

  const parts = [
    chalk.gray(`[${typeLabel}]`),
    chalk.yellow(opLabel),
    chalk.cyan(key),
  ];

  if (transform.args !== undefined && transform.op !== 'delete') {
    const argsStr = Array.isArray(transform.args)
      ? transform.args.join(', ')
      : transform.args;
    parts.push(`= ${argsStr}`);
  }

  return parts.join(' ');
}
