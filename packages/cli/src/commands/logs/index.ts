import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { validateIntegerRangeWithDefault } from '../../util/command-validation';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { isArgumentError, parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import {
  decodeContinuation,
  encodeContinuation,
  type EventsContinuation,
} from '../../util/observability/continuation';
import { quoteArg } from '../../util/flags/quote-arg';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { printNextPageCommand } from '../../util/pagination';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { writeWithBackpressure } from '../../util/output/write-with-backpressure';
import { sortIntervals } from '../../util/observability/events';
import { LogsTelemetryClient } from '../../util/telemetry/commands/logs';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { getCommandAliases } from '..';
import { help } from '../help';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  logsCommand,
  requestsSubcommand,
  runtimeSubcommand,
} from './command';
import { describeLogsApiError, printLogsApiError } from './errors';
import {
  type JsonErrorPayload,
  recordLine,
  serializeTimeRange,
  summaryLine,
  type WarningReason,
  warningLine,
  writeJsonError,
} from './json-output';
import {
  getLegacyOptionError,
  legacyLogsOptions,
  usedLegacyOptions,
} from './legacy-options';
import {
  composeFilter,
  type EventsResult,
  type ExcludedInterval,
  fetchEventPages,
  InvalidEventsResponseError,
  RecordTooLargeError,
} from './query';
import { createRenderer, formatWindow, sanitize } from './render';
import {
  BACKGROUND_FUNCTION_EXCLUSION,
  logsSources,
  type LogsSource,
  type LogsSourceName,
  sourceForEvent,
} from './sources';
import { resolveLogsTarget, teamLabel } from './target';
import { type LogsTimeRange, resolveLogsTimeRange } from './time-range';

const COMMAND_CONFIG = {
  runtime: getCommandAliases(runtimeSubcommand),
  requests: getCommandAliases(requestsSubcommand),
};

const SUBCOMMAND_METADATA = {
  runtime: runtimeSubcommand,
  requests: requestsSubcommand,
} as const;

const SOURCE_TITLES: Record<LogsSourceName, string> = {
  runtime: 'Runtime logs',
  requests: 'CDN requests',
};

/** Options fixed by a `--next` cursor; combining them with it is an error. */
const CONTINUATION_CONFLICTS = [
  '--project',
  '--deployment',
  '--environment',
  '--query',
  '--since',
  '--until',
] as const;

function looksLikeDeployment(value: string): boolean {
  return (
    value.startsWith('dpl_') ||
    value.includes('.') ||
    /^https?:\/\//i.test(value)
  );
}

function deploymentHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

/**
 * JSON output requested before parsing (`--json`, `--json=true`,
 * `--format json`, `--format=json`, `-F json`, `-F=json`), so parse errors
 * can use the JSON contract.
 */
function argvRequestsJson(argv: string[]): boolean {
  const args = argv.slice(2);
  for (const [index, arg] of args.entries()) {
    if (arg === '--') break;
    if (arg === '--json') return true;
    if (arg.startsWith('--json=')) {
      if (arg.slice('--json='.length).toLowerCase() !== 'false') return true;
      continue;
    }
    if (
      arg.toLowerCase() === '--format=json' ||
      (arg.startsWith('-F=') &&
        arg.slice('-F='.length).toLowerCase() === 'json')
    ) {
      return true;
    }
    if (
      (arg === '--format' || arg === '-F') &&
      args[index + 1]?.toLowerCase() === 'json'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The parser's error for the removed `-j` shorthand, alone or grouped with
 * other short flags (`-jf`).
 */
function isRemovedJsonShorthandError(err: unknown): boolean {
  return isArgumentError(err) && err.invalidOption === '-j';
}

/** An explicit team flag; configuration-derived scope does not count. */
function argvHasScopeFlag(argv: string[]): boolean {
  for (const arg of argv.slice(2)) {
    if (arg === '--') break;
    if (
      arg === '--scope' ||
      arg === '--team' ||
      arg === '-S' ||
      arg === '-T' ||
      arg.startsWith('--scope=') ||
      arg.startsWith('--team=')
    ) {
      return true;
    }
  }
  return false;
}

/** The `--deployment` form of a positional deployment, shell-quoted. */
function deploymentFlag(value: string): string {
  return `--deployment ${quoteArg(deploymentHost(value))}`;
}

/**
 * Explains a positional argument that can't run. Data sources are the only
 * positionals; a single deployment is accepted as a deprecated alias.
 */
function positionalError(
  value: string,
  explicitSource: LogsSourceName | undefined
): string {
  const sourcePart = explicitSource ? ` ${explicitSource}` : '';
  if (looksLikeDeployment(value)) {
    return `Select a deployment with --deployment: ${getCommandName(
      `logs${sourcePart} ${deploymentFlag(value)}`
    )}`;
  }
  if (explicitSource) {
    return `Unexpected argument "${value}". ${getCommandName(
      `logs ${explicitSource}`
    )} takes no arguments.`;
  }
  return `Unknown data source "${value}". Use runtime or requests. See ${getCommandName(
    'logs --help'
  )}.`;
}

function isClosedOutputError(err: unknown): boolean {
  return (
    err instanceof Error &&
    ((err as NodeJS.ErrnoException).code === 'EPIPE' ||
      err.message === 'Output stream closed.')
  );
}

/** One query to run: a fresh query, or the continuation of a previous one. */
interface QueryPlan {
  readonly source: LogsSource;
  readonly teamId: string;
  readonly projectId: string;
  readonly timeRange: LogsTimeRange;
  readonly filter?: string;
  readonly startCursor?: string;
  /** Human context line, printed on stderr. */
  readonly context: () => Promise<string>;
}

function streamGapMessage(interval: ExcludedInterval): string {
  return `Results omit ${sanitize(interval.start)} to ${sanitize(interval.end)}: data for this period is unavailable to this query.`;
}

export default async function logs(client: Client): Promise<number> {
  // Relative times resolve against one instant, so every page uses the same
  // bounds.
  const commandStart = Date.now();
  const telemetry = new LogsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArguments;
  try {
    parsedArguments = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification([...logsCommand.options, ...legacyLogsOptions])
    );
  } catch (err) {
    const removedShorthand = isRemovedJsonShorthandError(err);
    if (removedShorthand) {
      telemetry.trackCliLegacyOption('j');
    }
    const message = removedShorthand
      ? '-j was removed. Use --json.'
      : err instanceof Error
        ? err.message
        : String(err);
    if (client.nonInteractive || argvRequestsJson(client.argv)) {
      return writeJsonError(client, {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message,
        next: [{ command: 'vercel logs --help' }],
      });
    }
    if (removedShorthand) {
      output.error(message);
      return 2;
    }
    printError(err);
    output.print(`Run ${getCommandName('logs --help')} for usage.\n`);
    return 2;
  }
  if (parsedArguments.args[0] === 'log') {
    warnDeprecatedSubcommand(client, 'log', 'logs');
  }
  const { flags } = parsedArguments;
  const formatResult = validateJsonOutput(flags);
  // What the caller asked for, even when `--format` itself is invalid, so
  // that error is reported in the requested mode.
  const json =
    Boolean(flags['--json']) ||
    (formatResult.valid && formatResult.jsonOutput) ||
    argvRequestsJson(client.argv) ||
    client.nonInteractive;

  const { subcommand, subcommandOriginal, args } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );
  const explicitSource =
    subcommand === 'runtime' || subcommand === 'requests'
      ? subcommand
      : undefined;

  if (flags['--help']) {
    telemetry.trackCliFlagHelp('logs', explicitSource && subcommandOriginal);
    output.print(
      help(explicitSource ? SUBCOMMAND_METADATA[explicitSource] : logsCommand, {
        stream: client.stderr,
        parent: explicitSource ? logsCommand : undefined,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  const nextOption = flags['--next'];
  const trimmedNext = nextOption?.trim();
  const continuation = trimmedNext
    ? decodeContinuation(trimmedNext)
    : undefined;
  const continuationSource = continuation
    ? sourceForEvent(continuation.event)
    : undefined;

  // A continuation's source comes from its cursor, so telemetry records the
  // source that actually runs.
  const sourceName: LogsSourceName =
    explicitSource ?? continuationSource?.name ?? 'runtime';
  if (sourceName === 'requests') {
    telemetry.trackCliSubcommandRequests(subcommandOriginal);
  } else {
    telemetry.trackCliSubcommandRuntime(subcommandOriginal);
  }
  const projectOption = flags['--project'];
  const deploymentOption = flags['--deployment'];
  const environmentOption = flags['--environment'];
  const queryOption = flags['--query'];
  const sinceOption = flags['--since'];
  const untilOption = flags['--until'];
  const limitOption = flags['--limit'];
  telemetry.trackCliOptionProject(projectOption);
  telemetry.trackCliOptionDeployment(deploymentOption);
  telemetry.trackCliOptionEnvironment(environmentOption);
  telemetry.trackCliOptionQuery(queryOption);
  telemetry.trackCliOptionSince(sinceOption);
  telemetry.trackCliOptionUntil(untilOption);
  telemetry.trackCliOptionLimit(limitOption);
  telemetry.trackCliOptionNext(nextOption);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliFlagFollow(flags['--follow']);

  /** Reports a failure in the active output mode and returns its exit code. */
  const fail = (
    reason: string,
    message: string,
    exitCode?: number,
    extra: Partial<JsonErrorPayload> = {}
  ): number => {
    output.stopSpinner();
    if (json) {
      return writeJsonError(
        client,
        { status: 'error', reason, message, ...extra },
        exitCode
      );
    }
    output.error(message);
    return exitCode ?? (reason === AGENT_REASON.INVALID_ARGUMENTS ? 2 : 1);
  };
  const usageError = (message: string): number =>
    fail(AGENT_REASON.INVALID_ARGUMENTS, message, 2);

  /** Reports an unexpected thrown error in the active output mode. */
  const failUnexpected = (err: unknown): number => {
    output.stopSpinner();
    if (!json) {
      printError(err);
      return 1;
    }
    const failure = describeLogsApiError(client, err, sourceName);
    if (failure) {
      return writeJsonError(client, failure.json, failure.exitCode);
    }
    return writeJsonError(client, {
      status: 'error',
      reason: AGENT_REASON.API_ERROR,
      message: errorToString(err),
    });
  };

  if (!formatResult.valid) {
    return usageError(formatResult.error);
  }

  const legacyOptions = usedLegacyOptions(flags);
  for (const name of legacyOptions) {
    telemetry.trackCliLegacyOption(name);
  }
  const legacyError = getLegacyOptionError(flags);
  if (legacyError) {
    return usageError(legacyError);
  }

  // `vercel logs <deployment>` is a deprecated alias of `--deployment`.
  let positionalDeployment: string | undefined;
  if (args.length > 0) {
    telemetry.trackCliArgumentPositional(
      looksLikeDeployment(args[0]) ? 'deployment' : 'unknown'
    );
    if (args.length > 1 || !looksLikeDeployment(args[0])) {
      return usageError(positionalError(args[0], explicitSource));
    }
    if (deploymentOption !== undefined) {
      return usageError(
        'Pass the deployment once, with --deployment. Remove the deployment argument.'
      );
    }
    if (nextOption !== undefined) {
      return usageError(
        "A deployment argument can't be combined with --next. The cursor keeps the original target, filter, and time window."
      );
    }
    positionalDeployment = args[0];
  }

  // Warnings known before the query: JSON prints them as the first lines.
  const upfrontWarnings: string[] = [];
  const warn = (
    reason: WarningReason,
    message: string,
    data?: Record<string, unknown>
  ) => {
    if (json) {
      upfrontWarnings.push(warningLine({ reason, message, data }));
    } else {
      output.warning(message);
    }
  };

  if (flags['--follow']) {
    warn(
      'deprecated',
      '--follow is deprecated and no longer streams logs. Showing a bounded result; remove --follow.'
    );
  }

  if (positionalDeployment !== undefined) {
    warn(
      'deprecated',
      `Passing a deployment as an argument is deprecated. Use ${deploymentFlag(
        positionalDeployment
      )}.`
    );
  }

  let limit: number;
  if (
    typeof limitOption === 'number' &&
    Number.isInteger(limitOption) &&
    limitOption > MAX_LIMIT
  ) {
    limit = MAX_LIMIT;
    warn(
      'limit_clamped',
      `--limit ${limitOption} is above the maximum of ${MAX_LIMIT}. Using ${MAX_LIMIT}.`,
      { requested: limitOption, limit: MAX_LIMIT }
    );
  } else {
    const limitResult = validateIntegerRangeWithDefault(limitOption, {
      flag: '--limit',
      min: 1,
      max: MAX_LIMIT,
      defaultValue: DEFAULT_LIMIT,
    });
    if (!limitResult.valid) {
      return usageError(limitResult.message);
    }
    limit = limitResult.value;
  }

  let plan: QueryPlan;
  if (nextOption !== undefined) {
    const planResult = await planContinuation();
    if (typeof planResult === 'number') return planResult;
    plan = planResult;
  } else {
    const planResult = await planQuery();
    if (typeof planResult === 'number') return planResult;
    plan = planResult;
  }

  async function planContinuation(): Promise<QueryPlan | number> {
    if (!trimmedNext) {
      return usageError('--next must not be empty.');
    }
    const invalidCursor = `--next is not a valid cursor. Use the pagination.next value from the summary of a previous ${getCommandName(
      'logs --json'
    )} run.`;
    if (!continuation || !continuationSource) {
      return usageError(invalidCursor);
    }
    const parsed = parseContinuation(continuation);
    if (!parsed) {
      return usageError(invalidCursor);
    }
    if (explicitSource && explicitSource !== continuationSource.name) {
      return usageError(
        `The --next cursor continues a ${continuationSource.name} query. Use ${getCommandName(
          `logs --next <CURSOR>`
        )} without "${explicitSource}".`
      );
    }
    for (const flag of CONTINUATION_CONFLICTS) {
      if (flags[flag] !== undefined) {
        return usageError(
          `${flag} can't be combined with --next. The cursor keeps the original target, filter, and time window.`
        );
      }
    }
    // Without an explicit team flag, the cursor supplies the team. An
    // explicit one must agree with it; the entry point already resolved it.
    if (
      argvHasScopeFlag(client.argv) &&
      client.config.currentTeam !== continuation.ownerId
    ) {
      return usageError(
        'The --next cursor belongs to a different team than --scope. Remove --scope to use the team in the cursor.'
      );
    }

    const { teamId, projectId, timeRange } = parsed;
    return {
      source: continuationSource,
      teamId,
      projectId,
      timeRange,
      filter: continuation.filter,
      startCursor: continuation.cursor,
      context: async () => {
        const [label, project] = await Promise.all([
          teamLabel(client, teamId),
          getProjectByIdOrName(client, projectId, teamId).catch(() => null),
        ]);
        const projectName =
          project && !(project instanceof ProjectNotFound)
            ? project.name
            : projectId;
        return `${SOURCE_TITLES[continuationSource.name]} for ${label}/${projectName} (continued), ${formatWindow(timeRange)}`;
      },
    };
  }

  async function planQuery(): Promise<QueryPlan | number> {
    const source = logsSources[sourceName];
    const filter = queryOption?.trim();
    if (queryOption !== undefined && !filter) {
      return usageError('--query must not be empty.');
    }
    const environment = environmentOption?.trim();
    if (environmentOption !== undefined && !environment) {
      return usageError('--environment must not be empty.');
    }
    const deploymentInput = deploymentOption ?? positionalDeployment;
    const deployment = deploymentInput?.trim();
    if (deploymentInput !== undefined && !deployment) {
      return usageError('--deployment must not be empty.');
    }
    const project = projectOption?.trim();
    if (projectOption !== undefined && !project) {
      return usageError('--project must not be empty.');
    }

    const timeRangeResult = resolveLogsTimeRange({
      since: sinceOption,
      until: untilOption,
      now: commandStart,
      wholeSeconds: source.wholeSecondBounds,
    });
    if ('error' in timeRangeResult) {
      return usageError(timeRangeResult.error);
    }
    const timeRange = timeRangeResult.range;

    let targetResult;
    try {
      targetResult = await resolveLogsTarget(client, {
        project,
        deployment: deployment && deploymentHost(deployment),
        deploymentFromArgument: positionalDeployment !== undefined,
        quiet: json,
      });
    } catch (err) {
      return failUnexpected(err);
    }
    if ('error' in targetResult) {
      return fail(
        targetResult.reason,
        targetResult.error,
        targetResult.exitCode
      );
    }
    const { target } = targetResult;

    return {
      source,
      teamId: target.teamId,
      projectId: target.projectId,
      timeRange,
      filter: composeFilter({
        source,
        deploymentId: target.deploymentId,
        environment,
        filter,
      }),
      context: async () => {
        const details = [
          target.deploymentId ? `deployment ${target.deploymentId}` : undefined,
          environment ? `environment ${environment}` : undefined,
        ].filter(Boolean);
        return (
          `${SOURCE_TITLES[source.name]} for ${target.teamLabel}/${target.projectName}` +
          (details.length > 0 ? ` (${details.join(', ')})` : '') +
          `, ${formatWindow(timeRange)}`
        );
      },
    };
  }

  const { source, timeRange } = plan;
  const serializedTimeRange = serializeTimeRange(timeRange);
  const tokenFor = (cursor: string): string =>
    encodeContinuation({
      event: source.event,
      ownerId: plan.teamId,
      projectIds: [plan.projectId],
      timeRange: serializedTimeRange,
      ...(plan.filter !== undefined ? { filter: plan.filter } : {}),
      order: 'desc',
      cursor,
    });

  /** Writes to stdout; `false` when the reader closed the stream. */
  const write = async (text: string): Promise<boolean> => {
    try {
      await writeWithBackpressure(client.stdout, text);
      return true;
    } catch (err) {
      if (isClosedOutputError(err)) return false;
      throw err;
    }
  };

  if (!json) {
    output.print(chalk.dim(`${await plan.context()}\n`));
  }

  const pages = fetchEventPages(
    client,
    {
      source,
      teamId: plan.teamId,
      projectId: plan.projectId,
      timeRange,
      filter: plan.filter,
    },
    limit,
    plan.startCursor
  );
  const renderer = json ? undefined : createRenderer(source.name, timeRange);
  const excludedIntervals = new Map<string, ExcludedInterval>();
  let written = 0;
  let pagesFetched = 0;
  // The cursor the next request uses: after the last fully written page.
  let resumeCursor: string | undefined = plan.startCursor;
  let result: EventsResult;

  try {
    if (
      upfrontWarnings.length > 0 &&
      !(await write(upfrontWarnings.join('')))
    ) {
      return 0;
    }

    for (;;) {
      // Only before the first request: later spinners would interleave with
      // printed records, and a non-TTY prints each spinner message again.
      if (!json && pagesFetched === 0) {
        output.spinner(`Fetching ${source.recordsLabel}…`, 1000);
      }
      let next;
      try {
        next = await pages.next();
      } catch (err) {
        return reportFetchFailure(err);
      }
      output.stopSpinner();
      pagesFetched += 1;
      if (next.done) {
        result = next.value;
        break;
      }

      for (const interval of next.value.excludedIntervals) {
        excludedIntervals.set(`${interval.start}/${interval.end}`, interval);
      }

      const { events } = next.value;
      let chunk = '';
      if (renderer) {
        if (written === 0 && events.length > 0) {
          chunk += `${renderer.header()}\n`;
        }
        for (const event of events) {
          chunk += `${renderer.row(event)}\n`;
        }
      } else {
        for (const event of events) {
          chunk += recordLine(source.recordType, event);
        }
      }
      if (chunk && !(await write(chunk))) {
        return 0;
      }
      written += events.length;
      resumeCursor = next.value.nextCursor ?? undefined;
    }

    const intervals = sortIntervals(excludedIntervals.values());
    const nextToken = result.nextCursor ? tokenFor(result.nextCursor) : null;

    if (json) {
      const tail =
        intervals
          .map(interval =>
            warningLine({
              reason: 'stream_gap',
              message: streamGapMessage(interval),
              data: { start: interval.start, end: interval.end },
            })
          )
          .join('') +
        summaryLine({
          recordsReturned: written,
          timeRange: serializedTimeRange,
          pagination: { hasMore: result.hasMore, next: nextToken },
          excludedIntervals: intervals,
        });
      await write(tail);
      return 0;
    }

    for (const interval of intervals) {
      output.warning(streamGapMessage(interval));
    }

    if (written === 0) {
      const notes = [
        `No ${source.recordsLabel} found in this window. Use an earlier --since to search further back.`,
      ];
      if (source.fixedFilters.includes(BACKGROUND_FUNCTION_EXCLUSION)) {
        notes.push('Background function executions are always excluded.');
      }
      output.print(chalk.dim(`${notes.join('\n')}\n`));
    }

    if (result.hasMore) {
      output.log(`More ${source.recordsLabel} matched.`);
      if (nextToken) {
        output.print('\n');
        printNextPageCommand(getCommandNamePlain(`logs --next ${nextToken}`));
      }
      if (!nextToken || limit === MAX_LIMIT) {
        output.print('Narrow --query, --since, or --until to see the rest.\n');
      }
    }

    return 0;
  } catch (err) {
    // A write failure other than a closed reader: the output boundary is
    // uncertain, so no continuation is offered.
    return fail(
      'output_error',
      `Couldn't write the output: ${errorToString(err)}`,
      1
    );
  }

  function reportFetchFailure(err: unknown): number {
    output.stopSpinner();
    const intervals = sortIntervals(excludedIntervals.values());
    const progress =
      written > 0
        ? {
            recordsReturned: written,
            outputIncomplete: true,
            timeRange: serializedTimeRange,
            pagination: {
              hasMore: true,
              next: resumeCursor ? tokenFor(resumeCursor) : null,
            },
            excludedIntervals: intervals,
          }
        : undefined;

    const knownError =
      err instanceof RecordTooLargeError ||
      err instanceof InvalidEventsResponseError;

    if (json) {
      if (knownError) {
        return writeJsonError(client, {
          status: 'error',
          reason: AGENT_REASON.API_ERROR,
          message: err.message,
          ...(progress ? { data: progress } : {}),
        });
      }
      const failure = describeLogsApiError(client, err, source.name);
      const payload: JsonErrorPayload = failure
        ? failure.json
        : {
            status: 'error',
            reason: AGENT_REASON.API_ERROR,
            message: errorToString(err),
          };
      return writeJsonError(
        client,
        progress
          ? { ...payload, data: { ...payload.data, ...progress } }
          : payload,
        failure?.exitCode ?? 1
      );
    }

    let exitCode = 1;
    if (knownError) {
      output.error(err.message);
    } else {
      exitCode = describeLogsApiError(client, err, source.name)?.exitCode ?? 1;
      printLogsApiError(client, err, source.name);
    }
    if (progress) {
      output.error(
        `Output is incomplete: ${written} ${source.recordsLabel} were printed before the failure.`
      );
      if (progress.pagination.next) {
        output.print(
          `Retry the failed page:\n  ${getCommandName(
            `logs --next ${progress.pagination.next}`
          )}\n`
        );
      }
    }
    return exitCode;
  }
}

/** Validates the parts of a continuation the CLI relies on. */
function parseContinuation(
  continuation: EventsContinuation
): { teamId: string; projectId: string; timeRange: LogsTimeRange } | undefined {
  const projectIds = continuation.projectIds ?? [];
  if (projectIds.length !== 1 || continuation.order !== 'desc') {
    return undefined;
  }
  const start = new Date(continuation.timeRange.start);
  const end = new Date(continuation.timeRange.end);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.getTime() >= end.getTime() ||
    // Requests must replay byte-identical bounds; reject anything the CLI
    // would serialize differently.
    start.toISOString() !== continuation.timeRange.start ||
    end.toISOString() !== continuation.timeRange.end
  ) {
    return undefined;
  }
  return {
    teamId: continuation.ownerId,
    projectId: projectIds[0],
    timeRange: { start, end },
  };
}
