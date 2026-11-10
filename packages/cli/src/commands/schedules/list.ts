import chalk from 'chalk';
import type Client from '../../util/client';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { validateIntegerRangeWithDefault } from '../../util/command-validation';
import { quoteArg } from '../../util/flags/quote-arg';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printNextPageCommand } from '../../util/pagination';
import table from '../../util/output/table';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import {
  DEFAULT_SCHEDULE_NAMESPACE,
  DEFAULT_SCHEDULES_LIMIT,
} from '../../util/schedules/client';
import { formatScheduleTarget } from '../../util/schedules/format';
import type {
  ListSchedulesResponse,
  Schedule,
  ScheduleExpression,
} from '../../util/schedules/types';
import { SchedulesListTelemetryClient } from '../../util/telemetry/commands/schedules/list';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { handleSchedulesApiError } from './errors';
import { validateScheduleIdentifier } from './validation';
import {
  resolveSchedulesClient,
  scheduleCommandWithGlobalFlags,
  scheduleTrackArgs,
  validateLocalScheduleFlags,
} from './shared';

const USAGE = 'schedules list';

function invalidArguments(client: Client, message: string): number {
  if (client.nonInteractive) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      next: [
        {
          command: scheduleCommandWithGlobalFlags(client, USAGE),
          when: 'List schedules with valid options',
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

function formatExpression(expression: ScheduleExpression): string {
  return expression.type === 'cron' ? expression.cron : expression.at;
}

function scheduleTable(schedules: Schedule[]): string {
  const rows = [
    ['Name', 'State', 'Type', 'Expression', 'Target'].map(header =>
      chalk.dim(header)
    ),
    ...schedules.map(schedule => [
      chalk.bold(schedule.name),
      capitalize(schedule.state),
      capitalize(schedule.expression.type),
      formatExpression(schedule.expression),
      formatScheduleTarget(schedule.target),
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
  namespace: string,
  namespaceWasExplicit: boolean,
  limit: number,
  limitWasExplicit: boolean,
  trackArgs: string[],
  cursor: string
): string {
  const parts = ['schedules list'];
  if (namespaceWasExplicit) {
    parts.push(`--namespace ${quoteArg(namespace)}`);
  }
  parts.push(...trackArgs);
  if (limitWasExplicit) {
    parts.push(`--limit ${limit}`);
  }
  parts.push(`--next ${quoteArg(cursor)}`);
  return scheduleCommandWithGlobalFlags(client, parts.join(' '));
}

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new SchedulesListTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(listSubcommand.options)
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
  const namespace = flags['--namespace'] ?? DEFAULT_SCHEDULE_NAMESPACE;
  const limitResult = validateIntegerRangeWithDefault(flags['--limit'], {
    flag: '--limit',
    min: 1,
    max: 100,
    defaultValue: DEFAULT_SCHEDULES_LIMIT,
  });

  telemetry.trackCliOptionNamespace(flags['--namespace']);
  telemetry.trackCliOptionEnvironment(flags['--environment']);
  telemetry.trackCliOptionGitBranch(flags['--git-branch']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (args.length !== 0) {
    return invalidArguments(
      client,
      `Expected no arguments. Usage: ${getCommandName(USAGE)}`
    );
  }

  const namespaceError = validateScheduleIdentifier(namespace, 'Namespace');
  if (namespaceError) return invalidArguments(client, namespaceError);

  if (!limitResult.valid) {
    return invalidArguments(client, limitResult.message);
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return invalidArguments(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const schedules = await resolveSchedulesClient(client, flags);
  if (typeof schedules === 'number') return schedules;

  if (!asJson) {
    output.spinner('Fetching schedules…');
  }

  let result: ListSchedulesResponse;
  try {
    result = await schedules.list({
      namespace,
      cursor: flags['--next'],
      limit: limitResult.value,
    });
  } catch (error) {
    output.stopSpinner();
    return handleSchedulesApiError(client, error, {
      action: 'list',
      local: flags['--local'],
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
          message: `Found ${result.data.length} schedule${result.data.length === 1 ? '' : 's'} in namespace ${namespace}.`,
        }
      : { ...result, pagination: { next: result.cursor ?? null } };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  if (result.data.length === 0) {
    output.print(`No schedules found in namespace ${namespace}.\n`);
    return 0;
  }

  output.print(
    `Schedules in namespace ${chalk.bold(namespace)}\n\n${scheduleTable(result.data)}\n`
  );
  if (result.cursor) {
    const next = nextPageCommand(
      client,
      namespace,
      flags['--namespace'] !== undefined,
      limitResult.value,
      flags['--limit'] !== undefined,
      scheduleTrackArgs(flags),
      result.cursor
    );
    output.print('\n');
    printNextPageCommand(next);
  }

  return 0;
}
