import { isErrnoException } from '@vercel/error-utils';
import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { getLinkedProject } from '../../util/projects/link';
import { ProjectNotFound } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { QueryTelemetryClient } from '../../util/telemetry/commands/query';
import { help } from '../help';
import { queryCommand } from './command';
import output from '../../output-manager';
import {
  executeObservabilityQuery,
  type Query,
  type QueryResponse,
  type Duration,
} from '../../util/observability-query';
import { readFileSync } from 'fs';

function parseTime(input: string): Date {
  if (input === 'now') return new Date();

  // Try relative time (1h, 30m, 1d) via ms package
  const msValue = ms(input);
  if (typeof msValue === 'number') {
    return new Date(Date.now() - msValue);
  }

  // Try ISO format
  const date = new Date(input);
  if (!isNaN(date.getTime())) return date;

  throw new Error(`Invalid time format: ${input}`);
}

function parseGranularity(input: string): Duration {
  // Support formats like: 1ms, 1s, 1m, 1h, 1d, 1w
  const match = input.match(/^(\d+)(ms|s|m|h|d|w)$/);
  if (!match) throw new Error(`Invalid granularity: ${input}`);

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case 'ms':
      return { milliseconds: num };
    case 's':
      return { seconds: num };
    case 'm':
      return { minutes: num };
    case 'h':
      return { hours: num };
    case 'd':
      return { days: num };
    case 'w':
      return { weeks: num };
    default:
      throw new Error(`Invalid granularity unit: ${unit}`);
  }
}

function validateQuery(query: Partial<Query>): void {
  if (!query.event) {
    throw new Error('Event type is required (use --event or --input)');
  }
  if (!query.rollups || Object.keys(query.rollups).length === 0) {
    throw new Error(
      'At least one rollup is required (use --measure/--aggregation or --input)'
    );
  }
  if (!query.startTime || !query.endTime) {
    throw new Error('Time range is required (use --since/--until or --input)');
  }
}

async function readQueryFromStdin(client: Client): Promise<Partial<Query>> {
  return new Promise((resolve, reject) => {
    let data = '';
    client.stdin.on('data', (chunk: Buffer) => (data += chunk.toString()));
    client.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON from stdin'));
      }
    });
    client.stdin.on('error', reject);
  });
}

function readQueryFromFile(path: string): Partial<Query> {
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${path}`);
    }
    throw new Error(`Failed to parse JSON from file: ${path}`);
  }
}

interface BuildQueryOptions {
  event?: string;
  measure?: string;
  aggregation?: string;
  groupBy?: string[];
  filter?: string;
  since?: string;
  until?: string;
  granularity?: string;
  limit?: number;
  orderBy?: string;
  summaryOnly?: boolean;
  input?: string;
}

async function buildQuery(
  options: BuildQueryOptions,
  client: Client
): Promise<Query> {
  let query: Partial<Query> = {};

  // If input specified, read from file or stdin
  if (options.input) {
    if (options.input === '-') {
      query = await readQueryFromStdin(client);
    } else {
      query = readQueryFromFile(options.input);
    }
  }

  // CLI flags override input (if both provided)
  if (options.event) query.event = options.event;

  // Build time range
  if (options.since || options.until) {
    query.startTime = parseTime(options.since || '1h');
    query.endTime = parseTime(options.until || 'now');
  }

  // Build rollup from CLI flags
  if (options.measure && options.aggregation) {
    query.rollups = {
      value: {
        measure: options.measure,
        aggregation: options.aggregation,
      },
    };
  }

  // Apply other options
  if (options.groupBy) query.groupBy = options.groupBy;
  if (options.filter) query.filter = options.filter;
  if (options.granularity)
    query.granularity = parseGranularity(options.granularity);
  if (options.limit !== undefined) query.limit = options.limit;
  if (options.orderBy) query.orderBy = options.orderBy;
  if (options.summaryOnly) query.summaryOnly = true;

  // Validate required fields
  validateQuery(query);

  return query as Query;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    // Format numbers with appropriate units
    if (value > 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value > 1000) return `${(value / 1000).toFixed(2)}K`;
    return value.toFixed(2);
  }
  return String(value);
}

function formatQueryResponse(
  response: QueryResponse,
  options: { json?: boolean; showStatistics?: boolean }
): string {
  if (options.json) {
    return JSON.stringify(response, null, 2);
  }

  const lines: string[] = [];

  // Format timeseries data if present
  if (response.data && response.data.length > 0) {
    lines.push(chalk.bold('Timeseries Data:'));
    lines.push('');
    for (const point of response.data) {
      const { timestamp, ...values } = point;
      const timeStr = chalk.dim(timestamp);
      const valueStrs = Object.entries(values)
        .map(([key, val]) => `${key}: ${formatValue(val)}`)
        .join('  ');
      lines.push(`${timeStr}  ${valueStrs}`);
    }
    lines.push('');
  }

  // Format summary data
  if (response.summary && response.summary.length > 0) {
    lines.push(chalk.bold('Summary:'));
    lines.push('');

    // Simple key-value display for summary
    for (const point of response.summary) {
      const entries = Object.entries(point);
      for (const [key, value] of entries) {
        lines.push(`  ${chalk.cyan(key)}: ${formatValue(value)}`);
      }
      if (response.summary.length > 1) {
        lines.push('');
      }
    }
    lines.push('');
  }

  // Show statistics if requested
  if (options.showStatistics && response.statistics) {
    lines.push(chalk.bold('Query Statistics:'));
    const stats = response.statistics;
    if (stats.rowsRead !== undefined) {
      lines.push(`  Rows Scanned: ${stats.rowsRead.toLocaleString()}`);
    }
    if (stats.bytesRead !== undefined) {
      lines.push(`  Bytes Processed: ${stats.bytesRead.toLocaleString()}`);
    }
    if (stats.engineTimeSeconds !== undefined) {
      lines.push(
        `  Execution Time: ${(stats.engineTimeSeconds * 1000).toFixed(0)}ms`
      );
    }
    if (response.fromCache) {
      lines.push(`  ${chalk.green('Cache: Hit')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export default async function query(client: Client): Promise<number> {
  let parsedArguments;
  const flagsSpecification = getFlagsSpecification(queryCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new QueryTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArguments.flags['--help']) {
    telemetry.trackCliFlagHelp('query');
    output.print(help(queryCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const projectOption = parsedArguments.flags['--project'];
  const teamOption = parsedArguments.flags['--team'];
  const eventOption = parsedArguments.flags['--event'];
  const measureOption = parsedArguments.flags['--measure'];
  const aggregationOption = parsedArguments.flags['--aggregation'];
  const sinceOption = parsedArguments.flags['--since'];
  const untilOption = parsedArguments.flags['--until'];
  const groupByOption = parsedArguments.flags['--group-by'];
  const filterOption = parsedArguments.flags['--filter'];
  const granularityOption = parsedArguments.flags['--granularity'];
  const limitOption = parsedArguments.flags['--limit'];
  const orderByOption = parsedArguments.flags['--order-by'];
  const summaryOnlyOption = parsedArguments.flags['--summary-only'];
  const inputOption = parsedArguments.flags['--input'];
  const jsonOption = parsedArguments.flags['--json'];
  const showStatisticsOption = parsedArguments.flags['--show-statistics'];

  telemetry.trackCliOptionProject(projectOption);
  telemetry.trackCliOptionTeam(teamOption);
  telemetry.trackCliOptionEvent(eventOption);
  telemetry.trackCliOptionMeasure(measureOption);
  telemetry.trackCliOptionAggregation(aggregationOption);
  telemetry.trackCliOptionSince(sinceOption);
  telemetry.trackCliOptionUntil(untilOption);
  telemetry.trackCliOptionGroupBy(groupByOption);
  telemetry.trackCliOptionFilter(filterOption);
  telemetry.trackCliOptionGranularity(granularityOption);
  telemetry.trackCliOptionLimit(limitOption);
  telemetry.trackCliOptionOrderBy(orderByOption);
  telemetry.trackCliFlagSummaryOnly(summaryOnlyOption);
  telemetry.trackCliOptionInput(inputOption);
  telemetry.trackCliFlagJson(jsonOption);
  telemetry.trackCliFlagShowStatistics(showStatisticsOption);

  // Get scope (team/user context)
  let contextName: string | null = null;
  try {
    ({ contextName } = await getScope(client));
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  // Handle team/project context
  // Validate mutual exclusivity
  if (teamOption && projectOption) {
    output.error(
      'Cannot specify both --team and --project. Use one or the other.'
    );
    return 1;
  }

  if (teamOption) {
    // Set team context directly
    client.config.currentTeam = teamOption;
  } else if (projectOption) {
    // Resolve project and set team context
    output.spinner(`Fetching project "${projectOption}"`, 1000);
    const project = await getProjectByIdOrName(
      client,
      projectOption,
      client.config.currentTeam
    );
    output.stopSpinner();

    if (project instanceof ProjectNotFound) {
      output.error(`Project not found: ${projectOption}`);
      return 1;
    }
    // Set team context from project
    client.config.currentTeam = project.accountId;
  } else {
    // Try to use linked project
    const link = await getLinkedProject(client);
    if (link.status === 'error') {
      return link.exitCode;
    } else if (link.status === 'not_linked') {
      output.error(
        `Your codebase isn't linked to a project. Run ${getCommandName(
          'link'
        )} or use --project or --team.`
      );
      return 1;
    }
    client.config.currentTeam =
      link.org.type === 'team' ? link.org.id : undefined;
  }

  // Build query from flags/input
  let builtQuery: Query;
  try {
    builtQuery = await buildQuery(
      {
        event: eventOption,
        measure: measureOption,
        aggregation: aggregationOption,
        groupBy: groupByOption,
        filter: filterOption,
        since: sinceOption,
        until: untilOption,
        granularity: granularityOption,
        limit: limitOption,
        orderBy: orderByOption,
        summaryOnly: summaryOnlyOption,
        input: inputOption,
      },
      client
    );
  } catch (err) {
    output.error((err as Error).message);
    if (!inputOption) {
      output.log('');
      output.log('You must specify either:');
      output.log('  1. CLI flags: --event, --measure, --aggregation, --since');
      output.log('  2. JSON input: --input query.json');
      output.log('');
      output.log('Example:');
      output.log(
        '  vc query --event incomingRequest --measure count --aggregation sum --since 1h'
      );
    }
    return 1;
  }

  // Execute query
  if (!jsonOption) {
    output.print(
      `Executing query for event ${chalk.bold(builtQuery.event)} in ${chalk.bold(contextName)}...\n`
    );
  }

  output.spinner('Executing query...', 1000);

  let response: QueryResponse;
  try {
    response = await executeObservabilityQuery(client, builtQuery);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  output.stopSpinner();

  // Format and output results
  const formatted = formatQueryResponse(response, {
    json: jsonOption,
    showStatistics: showStatisticsOption,
  });

  output.print(formatted);

  if (!jsonOption) {
    const dataCount = response.data?.length || 0;
    const summaryCount = response.summary?.length || 0;
    output.print(
      chalk.gray(`\n${dataCount + summaryCount} results returned.\n`)
    );
  }

  return 0;
}
