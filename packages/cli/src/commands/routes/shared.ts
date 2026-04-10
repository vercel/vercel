import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { outputAgentError, buildCommandWithYes } from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import { getCommandNameWithGlobalFlags } from '../../util/arg-common';
import type { Command } from '../help';
import {
  getRouteTypeLabel,
  type RoutingRule,
  type RoutePosition,
  type RouteVersion,
} from '../../util/routes/types';

export interface ParsedSubcommand {
  args: string[];
  flags: { [key: string]: any };
}

/**
 * Plain suggested command with global flags from argv (--cwd, etc.).
 */
export function withGlobalFlags(
  client: Client,
  commandTemplate: string
): string {
  return getCommandNameWithGlobalFlags(commandTemplate, client.argv);
}

/**
 * Shell-escape route identifier for suggested `next` commands. Uses single
 * quotes when the name contains spaces so the suggested command is valid in the shell.
 * Falls back to double quotes only if the identifier contains a single quote.
 */
export function shellQuoteRouteIdentifierForSuggestion(
  identifier: string
): string {
  if (!identifier.includes(' ')) {
    return identifier;
  }
  if (!identifier.includes("'")) {
    return `'${identifier}'`;
  }
  if (!identifier.includes('"')) {
    return `"${identifier}"`;
  }
  return `"${identifier.replace(/"/g, '\\"')}"`;
}

export async function parseSubcommandArgs(
  argv: string[],
  command: Command,
  client?: Client
): Promise<ParsedSubcommand | number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(command.options);

  try {
    // @ts-expect-error - TypeScript complains about the flags specification type
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client?.nonInteractive) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
      let message = rawMessage;
      let next: Array<{ command: string; when?: string }> = [
        {
          command: getCommandNamePlain(
            `routes ${command.name} ${flags.join(' ')}`.trim()
          ),
          when: 'fix flags and retry',
        },
      ];

      // --ai is a string flag; `arg` errors with "option requires argument: --ai"
      // when the user passes `--ai` with no description. Give a concrete fix.
      const aiIdx = argv.indexOf('--ai');
      const aiMissingValue =
        aiIdx !== -1 &&
        (aiIdx === argv.length - 1 ||
          (argv[aiIdx + 1] !== undefined && argv[aiIdx + 1].startsWith('-')));
      const isAiArgError =
        aiMissingValue ||
        /option requires argument.*--ai|--ai.*requires argument/i.test(
          rawMessage
        );

      if (isAiArgError && (command.name === 'add' || command.name === 'edit')) {
        message =
          command.name === 'add'
            ? '--ai requires a description. Example: routes add --ai <description> --yes --non-interactive. Replace <description> with your text; use shell quotes if it contains spaces (e.g. --ai "Redirect /old to /new").'
            : '--ai requires a description. Example: routes edit <name-or-id> --ai <description> --yes --non-interactive. Replace placeholders; use shell quotes for <description> if it contains spaces.';
        next = [
          {
            command: withGlobalFlags(
              client,
              command.name === 'add'
                ? `routes add --ai <description> --yes`
                : `routes edit <name-or-id> --ai <description> --yes`
            ),
            when: 'replace <description> with your text (quote it in the shell if it contains spaces), then run',
          },
          {
            command: getCommandNamePlain(
              `routes ${command.name} --help ${flags.join(' ')}`.trim()
            ),
            when: 'see all flags',
          },
        ];
      }

      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message,
          next,
        },
        1
      );
      // Avoid printError if process.exit was mocked (tests).
      return 1;
    }
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
    if (client.nonInteractive) {
      const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
      const cmd = getCommandNamePlain(`link ${flags.join(' ')}`.trim());
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          userActionRequired: true,
          message:
            'Your codebase is not linked to a Vercel project. Run link first, then retry routes commands.',
          next: [
            {
              command: cmd,
              when: 'to link this directory to a project',
            },
          ],
        },
        1
      );
      return 1;
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

  if (client.nonInteractive) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      message: `${message} Re-run with --yes to confirm.`,
      next: [
        {
          command: buildCommandWithYes(client.argv),
          when: 're-run with --yes to confirm',
        },
      ],
    });
    process.exit(1);
    // If process.exit is mocked (tests), avoid falling through to confirm().
    return false;
  }

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
 * Formats a has/does-not-have condition for display.
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

  // Always inform the user that changes are staged
  output.print(
    `\n  ${chalk.gray(`This change is staged. Run ${chalk.cyan(getCommandName('routes publish'))} to make it live, or ${chalk.cyan(getCommandName('routes discard-staging'))} to undo.`)}\n`
  );

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
      `There are other staged changes. Review with ${chalk.cyan(getCommandName('routes list --diff'))} before promoting.`
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
    const routeType = getRouteTypeLabel(route);

    output.print(
      `  ${symbol} ${route.name}${routeType !== '-' ? ` ${chalk.gray(`(${routeType})`)}` : ''} ${chalk.gray(`- ${label}`)}\n`
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

  if (route.previousEnabled !== undefined) {
    return route.enabled === false ? 'Disabled' : 'Enabled';
  }

  return 'Modified';
}

/**
 * Resolves a single route identifier (name or ID) to a RoutingRule.
 * Tries exact ID match first, then case-insensitive name match.
 * If multiple routes match, prompts the user to select interactively.
 * Returns null if not found or selection is cancelled.
 */
export async function resolveRoute(
  client: Client,
  routes: RoutingRule[],
  identifier: string
): Promise<RoutingRule | null> {
  // Exact ID match
  const byId = routes.find(r => r.id === identifier);
  if (byId) return byId;

  // Case-insensitive name match
  const query = identifier.toLowerCase();
  const matches = routes.filter(
    r =>
      r.name.toLowerCase() === query ||
      r.name.toLowerCase().includes(query) ||
      r.id.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  // Multiple matches — non-interactive cannot prompt
  if (client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.AMBIGUOUS_ROUTE,
        message: `Multiple routes match "${identifier}" (${matches.length} matches). Pass an exact route name or ID.`,
        next: [
          {
            command: withGlobalFlags(client, 'routes list'),
            when: 'list routes to get exact id',
          },
        ],
      },
      1
    );
    return null;
  }

  // Multiple matches — interactive disambiguation
  const selectedId = await client.input.select({
    message: `Multiple routes match "${identifier}". Select one:`,
    choices: matches.map(route => ({
      value: route.id,
      name: `${route.name} ${chalk.gray(`(${route.route.src})`)}`,
    })),
  });

  return matches.find(r => r.id === selectedId) ?? null;
}

/**
 * Resolves multiple route identifiers to RoutingRules.
 * Returns null if any identifier cannot be resolved.
 * Deduplicates resolved routes by ID.
 */
export async function resolveRoutes(
  client: Client,
  routes: RoutingRule[],
  identifiers: string[]
): Promise<RoutingRule[] | null> {
  const resolved = new Map<string, RoutingRule>();

  for (const identifier of identifiers) {
    const route = await resolveRoute(client, routes, identifier);
    if (!route) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.NOT_FOUND,
            message: `No route found matching "${identifier}".`,
            next: [
              {
                command: withGlobalFlags(client, 'routes list'),
                when: 'list routes',
              },
            ],
          },
          1
        );
        return null;
      }
      output.error(
        `No route found matching "${identifier}". Run ${chalk.cyan(
          getCommandName('routes list')
        )} to see all routes.`
      );
      return null;
    }
    resolved.set(route.id, route);
  }

  return Array.from(resolved.values());
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
