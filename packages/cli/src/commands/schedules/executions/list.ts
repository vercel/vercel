import chalk from 'chalk';
import type Client from '../../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
} from '../../../util/agent-output-constants';
import {
  validateIntegerRangeWithDefault,
  validateTimeBound,
} from '../../../util/command-validation';
import formatDate from '../../../util/format-date';
import { quoteArg } from '../../../util/flags/quote-arg';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printNextPageCommand } from '../../../util/pagination';
import { formatAlignedLabel } from '../../../util/output/print-aligned-label';
import table from '../../../util/output/table';
import {
  validateJsonOutput,
  wantsMachineReadableOutput,
} from '../../../util/output-format';
import { getRenamedOption, withWarnings } from '../../../util/renamed-option';
import { getCommandName } from '../../../util/pkg-name';
import {
  DEFAULT_SCHEDULE_NAMESPACE,
  DEFAULT_SCHEDULES_LIMIT,
} from '../../../util/schedules/client';
import type {
  ListExecutionsResponse,
  ScheduleExecution,
  ScheduleExecutionMetrics,
  ScheduleExecutionStatus,
} from '../../../util/schedules/types';
import { SchedulesListExecutionsTelemetryClient } from '../../../util/telemetry/commands/schedules/list-executions';
import output from '../../../output-manager';
import { executionsListSubcommand } from '../command';
import { handleSchedulesApiError } from '../errors';
import { validateScheduleIdentifier } from '../validation';
import {
  resolveSchedulesClient,
  scheduleTrackArgs,
  unsupportedLocalExecutions,
  validateLocalScheduleFlags,
} from '../shared';

const USAGE = 'schedules executions list <name>';
const MAX_EXECUTION_RANGE_MS = 30 * 86_400_000;

function invalidArguments(client: Client, message: string): number {
  if (client.nonInteractive) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, USAGE),
          when: 'List schedule executions with valid options',
        },
      ],
    });
    return 2;
  }

  output.fatal(message);
  return 2;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatExecutionStatus(status: ScheduleExecutionStatus): string {
  if (status === 'succeeded') return chalk.green('Succeeded');
  if (status === 'failed') return chalk.red('Failed');
  return chalk.gray('Unavailable');
}

function formatPercentage(value: number | null): string {
  if (value === null) return chalk.gray('-');
  return `${Number((value * 100).toFixed(2))}%`;
}

function formatDuration(value: number | null): string {
  if (value === null) return chalk.gray('-');
  if (value < 1_000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${Number((value / 1_000).toFixed(1))}s`;
  return `${Number((value / 60_000).toFixed(1))}m`;
}

function formatInvocationCount(value: number): string {
  return `${value} invocation${value === 1 ? '' : 's'}`;
}

function executionMetrics(metrics: ScheduleExecutionMetrics): string {
  return [
    formatAlignedLabel(
      'Range',
      `${formatDate(metrics.from)} – ${formatDate(metrics.to)}`
    ),
    formatAlignedLabel(
      'Recorded',
      formatInvocationCount(metrics.recordedInvocations)
    ),
    formatAlignedLabel(
      'Failed',
      formatInvocationCount(metrics.failedInvocations)
    ),
    formatAlignedLabel('Error Rate', formatPercentage(metrics.errorRate)),
    formatAlignedLabel(
      'Avg Duration',
      formatDuration(metrics.averageDurationMs)
    ),
  ].join('\n');
}

function executionTable(executions: ScheduleExecution[]): string {
  const rows = [
    ['Execution ID', 'Status', 'Source', 'Fired At'].map(header =>
      chalk.dim(header)
    ),
    ...executions.map(execution => [
      chalk.bold(execution.executionId),
      formatExecutionStatus(execution.status),
      execution.invokeSource
        ? capitalize(execution.invokeSource)
        : chalk.gray('-'),
      execution.firedAt === null
        ? chalk.gray('-')
        : formatDate(execution.firedAt),
    ]),
  ];

  return table(rows, { hsep: 3 })
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/^/gm, '  ');
}

function nextPageCommand(
  client: Client,
  name: string,
  namespace: string,
  options: {
    namespaceWasExplicit: boolean;
    limit: number;
    limitWasExplicit: boolean;
    sort?: string;
    sortWasExplicit: boolean;
    from?: number;
    to?: number;
    executionId?: string;
    trackArgs: string[];
    cursor: string;
  }
): string {
  const parts = ['schedules executions list', quoteArg(name)];
  if (options.namespaceWasExplicit) {
    parts.push(`--namespace ${quoteArg(namespace)}`);
  }
  parts.push(...options.trackArgs);
  if (options.limitWasExplicit) {
    parts.push(`--limit ${options.limit}`);
  }
  if (options.sortWasExplicit && options.sort) {
    parts.push(`--sort ${options.sort}`);
  }
  if (options.from !== undefined && options.to !== undefined) {
    // Absolute times keep later pages on the same window as the first.
    parts.push(
      `--since ${new Date(options.from).toISOString()} --until ${new Date(options.to).toISOString()}`
    );
  }
  if (options.executionId !== undefined) {
    parts.push(`--execution ${quoteArg(options.executionId)}`);
  }
  parts.push(`--next ${quoteArg(options.cursor)}`);
  return buildCommandWithGlobalFlags(client.argv, parts.join(' '));
}

type TimeRange = { from?: number; to?: number };

function resolveTimeBound(
  flag: '--since' | '--until',
  value: string | undefined,
  legacyFlag: '--from' | '--to',
  legacyValue: number | undefined
): { value?: number } | { error: string } {
  if (value !== undefined && legacyValue !== undefined) {
    return {
      error: `Pass only one of \`${flag}\` or \`${legacyFlag}\`. (\`${legacyFlag}\` is deprecated.)`,
    };
  }
  if (legacyValue !== undefined) {
    if (!Number.isInteger(legacyValue) || legacyValue < 0) {
      return {
        error: `\`${legacyFlag}\` must be a non-negative integer (Unix milliseconds).`,
      };
    }
    return { value: legacyValue };
  }
  if (value === undefined) {
    return {};
  }
  if (!value.trim()) {
    return { error: `\`${flag}\` cannot be empty.` };
  }
  const result = validateTimeBound(value);
  if (!result.valid) {
    return { error: `\`${flag}\`: ${result.message}` };
  }
  return { value: result.value?.getTime() };
}

function resolveTimeRange(
  since: string | undefined,
  until: string | undefined,
  legacyFrom: number | undefined,
  legacyTo: number | undefined
): TimeRange | { error: string } {
  // Captured before parsing so a relative --since stays within the window.
  const now = Date.now();
  const start = resolveTimeBound('--since', since, '--from', legacyFrom);
  if ('error' in start) return start;
  const end = resolveTimeBound('--until', until, '--to', legacyTo);
  if ('error' in end) return end;

  const sinceName = legacyFrom !== undefined ? '--from' : '--since';
  const untilName = legacyTo !== undefined ? '--to' : '--until';
  const from = start.value;
  if (from === undefined) {
    if (end.value !== undefined) {
      return { error: `\`${untilName}\` requires \`--since\`.` };
    }
    return {};
  }
  const to = end.value ?? now;
  if (to <= from) {
    return { error: `\`${untilName}\` must be after \`${sinceName}\`.` };
  }
  if (to - from > MAX_EXECUTION_RANGE_MS) {
    return { error: 'The time range must be at most 30 days.' };
  }
  return { from, to };
}

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new SchedulesListExecutionsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(executionsListSubcommand.options)
    );
  } catch (error) {
    return invalidArguments(
      client,
      error instanceof Error ? error.message : String(error)
    );
  }

  const { args, flags } = parsedArgs;
  telemetry.trackCliFlagLocal(flags['--local']);
  const conflict = validateLocalScheduleFlags(client, flags, USAGE);
  if (conflict !== undefined) return conflict;
  if (flags['--local']) return unsupportedLocalExecutions(client);
  const [name] = args;
  const namespace = flags['--namespace'] ?? DEFAULT_SCHEDULE_NAMESPACE;
  const limitResult = validateIntegerRangeWithDefault(flags['--limit'], {
    flag: '--limit',
    min: 1,
    max: 100,
    defaultValue: DEFAULT_SCHEDULES_LIMIT,
  });
  const sort = flags['--sort'];
  const execution = getRenamedOption(flags, '--execution', '--execution-id', {
    // Matches when the result is JSON, below.
    json:
      wantsMachineReadableOutput(undefined, client.argv) ||
      client.nonInteractive,
  });

  telemetry.trackCliArgumentName(name);
  telemetry.trackCliOptionNamespace(flags['--namespace']);
  telemetry.trackCliOptionEnvironment(flags['--environment']);
  telemetry.trackCliOptionGitBranch(flags['--git-branch']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  telemetry.trackCliOptionSort(sort);
  telemetry.trackCliOptionSince(flags['--since']);
  telemetry.trackCliOptionUntil(flags['--until']);
  telemetry.trackCliOptionFrom(flags['--from']);
  telemetry.trackCliOptionTo(flags['--to']);
  telemetry.trackCliOptionExecution(flags['--execution']);
  telemetry.trackCliOptionExecutionId(flags['--execution-id']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if ('error' in execution) {
    return invalidArguments(client, execution.error);
  }
  const executionId = execution.value;

  if (!name) {
    return invalidArguments(
      client,
      `A schedule name is required. Usage: ${getCommandName(USAGE)}`
    );
  }
  if (args.length !== 1) {
    return invalidArguments(
      client,
      `Expected one schedule name. Usage: ${getCommandName(USAGE)}`
    );
  }

  const nameError = validateScheduleIdentifier(name, 'Schedule name');
  if (nameError) return invalidArguments(client, nameError);
  const namespaceError = validateScheduleIdentifier(namespace, 'Namespace');
  if (namespaceError) return invalidArguments(client, namespaceError);

  if (!limitResult.valid) {
    return invalidArguments(client, limitResult.message);
  }

  if (sort !== undefined && sort !== 'asc' && sort !== 'desc') {
    return invalidArguments(client, '`--sort` must be `asc` or `desc`.');
  }

  const timeRange = resolveTimeRange(
    flags['--since'],
    flags['--until'],
    flags['--from'],
    flags['--to']
  );
  if ('error' in timeRange) {
    return invalidArguments(client, timeRange.error);
  }
  const { from, to } = timeRange;
  if (flags['--from'] !== undefined) {
    output.warn('`--from` is deprecated, please use `--since` instead');
  }
  if (flags['--to'] !== undefined) {
    output.warn('`--to` is deprecated, please use `--until` instead');
  }

  if (executionId !== undefined && !executionId.trim()) {
    const typed =
      flags['--execution-id'] !== undefined ? '--execution-id' : '--execution';
    return invalidArguments(client, `\`${typed}\` cannot be empty.`);
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return invalidArguments(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const schedules = await resolveSchedulesClient(client, flags);
  if (typeof schedules === 'number') return schedules;

  if (!asJson) {
    output.spinner(`Fetching executions for ${namespace}/${name}…`);
  }

  let result: ListExecutionsResponse;
  try {
    result = await schedules.listExecutions({
      name,
      namespace,
      cursor: flags['--next'],
      limit: limitResult.value,
      ...(sort !== undefined ? { sort } : {}),
      ...(from !== undefined ? { from, to } : {}),
      ...(executionId !== undefined ? { executionId } : {}),
    });
  } catch (error) {
    output.stopSpinner();
    return handleSchedulesApiError(client, error, {
      action: 'list-executions',
      local: flags['--local'],
      name,
      namespace,
      trackArgs: scheduleTrackArgs(flags),
    });
  }

  output.stopSpinner();

  if (asJson) {
    const jsonOutput = client.nonInteractive
      ? {
          status: AGENT_STATUS.OK,
          data: result.data,
          cursor: result.cursor,
          pagination: { next: result.cursor ?? null },
          metrics: result.metrics,
          message: `Found ${result.data.length} execution${result.data.length === 1 ? '' : 's'} for schedule ${namespace}/${name}.`,
        }
      : { ...result, pagination: { next: result.cursor ?? null } };
    client.stdout.write(
      `${JSON.stringify(withWarnings(jsonOutput, [execution.warning]), null, 2)}\n`
    );
    return 0;
  }

  output.print(
    `Executions for schedule ${chalk.bold(`${namespace}/${name}`)}\n\n${executionMetrics(result.metrics)}\n`
  );
  if (result.data.length === 0) {
    output.print(
      `\n  No executions found for schedule ${chalk.bold(`${namespace}/${name}`)}.\n`
    );
    return 0;
  }

  output.print(`\n${executionTable(result.data)}\n`);
  if (result.cursor) {
    const next = nextPageCommand(client, name, namespace, {
      namespaceWasExplicit: flags['--namespace'] !== undefined,
      limit: limitResult.value,
      limitWasExplicit: flags['--limit'] !== undefined,
      sort,
      sortWasExplicit: flags['--sort'] !== undefined,
      from,
      to,
      executionId,
      trackArgs: scheduleTrackArgs(flags),
      cursor: result.cursor,
    });
    output.print('\n');
    printNextPageCommand(next);
  }

  return 0;
}
