import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import type { Command } from '../help';
import type {
  RoutingRule,
  RouteType,
  RoutePosition,
  RouteVersion,
} from '../../util/routes/types';

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
    parts.push(condition.key ? `= ${formatted}` : formatted);
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
 * When includeType is true (default): [Request Header] set X-Custom = "value"
 * When includeType is false:          set X-Custom = "value"
 */
export function formatTransform(
  transform: {
    type: string;
    op: string;
    target: { key: string | Record<string, unknown> };
    args?: string | string[];
  },
  includeType = true
): string {
  const opLabel = TRANSFORM_OP_LABELS[transform.op] ?? transform.op;

  const key =
    typeof transform.target.key === 'string'
      ? transform.target.key
      : JSON.stringify(transform.target.key);

  const parts: string[] = [];
  if (includeType) {
    const typeLabel = TRANSFORM_TYPE_LABELS[transform.type] ?? transform.type;
    parts.push(chalk.gray(`[${typeLabel}]`));
  }
  parts.push(chalk.yellow(opLabel), chalk.cyan(key));

  if (transform.args !== undefined && transform.op !== 'delete') {
    const argsStr = Array.isArray(transform.args)
      ? transform.args.join(', ')
      : transform.args;
    parts.push(`= ${argsStr}`);
  }

  return parts.join(' ');
}

/**
 * Parses a position string into an API-compatible RoutePosition object.
 * Supports: start, end, after:<id>, before:<id>.
 */
export function parsePosition(position: string): RoutePosition {
  if (position === 'start') {
    return { placement: 'start' };
  }
  if (position === 'end') {
    return { placement: 'end' };
  }
  if (position.startsWith('after:')) {
    const referenceId = position.slice(6);
    if (!referenceId) {
      throw new Error('Position "after:" requires a route ID');
    }
    return { placement: 'after', referenceId };
  }
  if (position.startsWith('before:')) {
    const referenceId = position.slice(7);
    if (!referenceId) {
      throw new Error('Position "before:" requires a route ID');
    }
    return { placement: 'before', referenceId };
  }
  throw new Error(
    `Invalid position: "${position}". Use: start, end, after:<id>, or before:<id>`
  );
}

/**
 * Offers to auto-promote if this is the only staged change.
 * Used after add, delete, enable, disable, and reorder operations.
 */
export async function offerAutoPromote(
  client: Client,
  projectId: string,
  version: RouteVersion,
  hadExistingStagingVersion: boolean,
  opts: { teamId?: string; skipPrompts?: boolean }
): Promise<void> {
  const { default: updateRouteVersion } = await import(
    '../../util/routes/update-route-version'
  );
  const { default: stamp } = await import('../../util/output/stamp');

  if (!hadExistingStagingVersion && !opts.skipPrompts) {
    output.print('\n');
    const shouldPromote = await client.input.confirm(
      'This is the only staged change. Promote to production now?',
      false
    );

    if (shouldPromote) {
      const promoteStamp = stamp();
      output.spinner('Promoting to production');

      try {
        await updateRouteVersion(client, projectId, version.id, 'promote', {
          teamId: opts.teamId,
        });

        output.log(
          `${chalk.cyan('Promoted')} to production ${chalk.gray(promoteStamp())}`
        );
      } catch (e: unknown) {
        const err = e as { message?: string };
        output.error(
          `Failed to promote to production: ${err.message || 'Unknown error'}`
        );
      }
    }
  } else if (hadExistingStagingVersion) {
    output.warn(
      `There are other staged changes. Review with ${chalk.cyan(getCommandName('routes list --staging'))} before promoting.`
    );
  }
}

/**
 * Print a summary of route changes for diff display.
 */
export function printDiffSummary(routes: RoutingRule[], maxDisplay = 10): void {
  const displayRoutes = routes.slice(0, maxDisplay);

  for (const route of displayRoutes) {
    const symbol = getDiffSymbol(route);
    const label = getDiffLabel(route);
    const routeType = getPrimaryRouteType(route);

    output.print(
      `  ${symbol} ${route.name}${routeType ? ` ${chalk.gray(`(${routeType})`)}` : ''} ${chalk.gray(`- ${label}`)}\n`
    );
  }

  if (routes.length > maxDisplay) {
    output.print(
      chalk.gray(`\n  ... and ${routes.length - maxDisplay} more changes\n`)
    );
  }
}

export function getDiffSymbol(route: RoutingRule): string {
  if (route.action === '+') return chalk.green('+');
  if (route.action === '-') return chalk.red('-');
  return chalk.yellow('~');
}

export function getDiffLabel(route: RoutingRule): string {
  if (route.action === '+') return 'Added';
  if (route.action === '-') return 'Deleted';

  const isReordered =
    route.previousIndex !== undefined && route.newIndex !== undefined;

  if (isReordered) {
    return `Reordered (${route.previousIndex! + 1} → ${route.newIndex! + 1})`;
  }

  return 'Modified';
}

export function getPrimaryRouteType(route: RoutingRule): string | null {
  const types = route.routeTypes ?? [];
  if (types.length === 0) return null;

  const typeLabels: Record<RouteType, string> = {
    header: 'Header',
    rewrite: 'Rewrite',
    redirect: 'Redirect',
    set_status: 'Set Status',
    transform: 'Transform',
  };

  return typeLabels[types[0]] ?? null;
}

/**
 * Find a version by ID, supporting partial ID matching.
 */
export function findVersionById(
  versions: RouteVersion[],
  identifier: string
):
  | { version: RouteVersion; error?: undefined }
  | { version?: undefined; error: string } {
  const matchingVersions = versions.filter(v => v.id.startsWith(identifier));

  if (matchingVersions.length === 0) {
    return {
      error: `Version "${identifier}" not found. Run ${chalk.cyan(
        getCommandName('routes list-versions')
      )} to see available versions.`,
    };
  }

  if (matchingVersions.length > 1) {
    return {
      error: `Multiple versions match "${identifier}". Please provide a more specific ID:\n${matchingVersions
        .map(v => `  ${v.id}`)
        .join('\n')}`,
    };
  }

  return { version: matchingVersions[0] };
}
