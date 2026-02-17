import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { querySubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import {
  validateRequiredEvent,
  validateEvent,
  validateMeasure,
  validateAggregation,
  validateGroupBy,
  validateMutualExclusivity,
} from './validation';
import { getDefaultAggregation } from './schema-data';
import {
  formatCsv,
  formatQueryJson,
  formatErrorJson,
  getRollupColumnName,
} from './output';
import {
  resolveTimeRange,
  computeGranularity,
  toGranularityMs,
  getAutoGranularity,
  roundTimeBoundaries,
  toGranularityMsFromDuration,
} from './time-utils';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import type { Scope, ValidationError, MetricsQueryResponse } from './types';
import { getLinkedProject } from '../../util/projects/link';
import getScope from '../../util/get-scope';
import { isAPIError } from '../../util/errors-ts';

function handleValidationError(
  result: ValidationError,
  jsonOutput: boolean,
  client: Client
): number {
  if (jsonOutput) {
    client.stdout.write(
      formatErrorJson(result.code, result.message, result.allowedValues)
    );
  } else {
    output.error(result.message);
    if (result.allowedValues && result.allowedValues.length > 0) {
      output.print(
        `\nAvailable ${result.code === 'UNKNOWN_EVENT' ? 'events' : result.code === 'UNKNOWN_MEASURE' ? 'measures' : result.code === 'INVALID_AGGREGATION' ? 'aggregations' : 'dimensions'}: ${result.allowedValues.join(', ')}\n`
      );
    }
  }
  return 1;
}

function handleApiError(
  err: { status: number; code?: string; serverMessage?: string },
  jsonOutput: boolean,
  client: Client
): number {
  let code: string;
  let message: string;

  switch (err.status) {
    case 402:
      code = 'PAYMENT_REQUIRED';
      message =
        'This feature requires an Observability Plus subscription. Upgrade at https://vercel.com/dashboard/settings/billing';
      break;
    case 403:
      code = 'FORBIDDEN';
      message =
        'You do not have permission to query metrics for this project/team.';
      break;
    case 500:
      code = 'INTERNAL_ERROR';
      message = 'An internal error occurred. Please try again later.';
      break;
    case 504:
      code = 'TIMEOUT';
      message =
        'The query timed out. Try a shorter time range or fewer groups.';
      break;
    default:
      code = err.code || 'BAD_REQUEST';
      message = err.serverMessage || `API error (${err.status})`;
  }

  if (jsonOutput) {
    client.stdout.write(formatErrorJson(code, message));
  } else {
    output.error(message);
  }
  return 1;
}

async function resolveQueryScope(
  client: Client,
  opts: {
    project: string | undefined;
    all: boolean | undefined;
    jsonOutput: boolean;
  }
): Promise<{ scope: Scope; accountId: string } | number> {
  // --project or --all: resolve team context via getScope
  if (opts.project || opts.all) {
    const { team } = await getScope(client);
    if (!team) {
      const errMsg =
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.';
      if (opts.jsonOutput) {
        client.stdout.write(formatErrorJson('NO_TEAM', errMsg));
      } else {
        output.error(errMsg);
      }
      return 1;
    }

    if (opts.all) {
      return {
        scope: { type: 'team-with-slug', teamSlug: team.slug },
        accountId: team.id,
      };
    }

    return {
      scope: {
        type: 'project-with-slug',
        teamSlug: team.slug,
        projectName: opts.project!,
      },
      accountId: team.id,
    };
  }

  // Default: use linked project
  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }
  if (linkedProject.status === 'not_linked') {
    const errMsg =
      'No linked project found. Run `vercel link` to link a project, or use --project <name> or --all.';
    if (opts.jsonOutput) {
      client.stdout.write(formatErrorJson('NOT_LINKED', errMsg));
    } else {
      output.error(errMsg);
    }
    return 1;
  }

  return {
    scope: {
      type: 'project-with-slug',
      teamSlug: linkedProject.org.slug,
      projectName: linkedProject.project.name,
    },
    accountId: linkedProject.org.id,
  };
}

export default async function query(
  client: Client,
  telemetry: MetricsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(querySubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const flags = parsedArgs.flags;

  // Validate output format
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  // Extract raw flag values
  const eventFlag = flags['--event'];
  const measure = flags['--measure'] ?? 'count';
  const aggregationFlag = flags['--aggregation'];
  const groupBy = flags['--group-by'] ?? [];
  const limit = flags['--limit'];
  const orderBy = flags['--order-by'];
  const filter = flags['--filter'];
  const since = flags['--since'];
  const until = flags['--until'];
  const granularity = flags['--granularity'];
  const project = flags['--project'];
  const all = flags['--all'];

  // Track telemetry
  telemetry.trackCliOptionEvent(eventFlag);
  telemetry.trackCliOptionMeasure(flags['--measure']);
  telemetry.trackCliOptionAggregation(aggregationFlag);
  telemetry.trackCliOptionGroupBy(groupBy.length > 0 ? groupBy : undefined);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliOptionOrderBy(orderBy);
  telemetry.trackCliOptionFilter(filter);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionGranularity(granularity);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionFormat(flags['--format']);

  // Validate --event (required)
  const requiredResult = validateRequiredEvent(eventFlag);
  if (!requiredResult.valid) {
    return handleValidationError(requiredResult, jsonOutput, client);
  }
  const event = requiredResult.value;

  // Compute aggregation after event is validated
  const aggregation = aggregationFlag ?? getDefaultAggregation(event, measure);

  // Validate event name
  const eventResult = validateEvent(event);
  if (!eventResult.valid) {
    return handleValidationError(eventResult, jsonOutput, client);
  }

  // Validate measure
  const measureResult = validateMeasure(event, measure);
  if (!measureResult.valid) {
    return handleValidationError(measureResult, jsonOutput, client);
  }

  // Validate aggregation
  const aggResult = validateAggregation(event, measure, aggregation);
  if (!aggResult.valid) {
    return handleValidationError(aggResult, jsonOutput, client);
  }

  // Validate group-by dimensions
  const groupByResult = validateGroupBy(event, groupBy);
  if (!groupByResult.valid) {
    return handleValidationError(groupByResult, jsonOutput, client);
  }

  // Validate mutual exclusivity
  const mutualResult = validateMutualExclusivity(all, project);
  if (!mutualResult.valid) {
    return handleValidationError(mutualResult, jsonOutput, client);
  }

  // Resolve scope
  const scopeResult = await resolveQueryScope(client, {
    project,
    all,
    jsonOutput,
  });
  if (typeof scopeResult === 'number') {
    return scopeResult;
  }
  const { scope, accountId } = scopeResult;

  // Resolve time range
  let startTime: Date;
  let endTime: Date;
  try {
    ({ startTime, endTime } = resolveTimeRange(since, until));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (jsonOutput) {
      client.stdout.write(formatErrorJson('INVALID_TIME', errMsg));
    } else {
      output.error(errMsg);
    }
    return 1;
  }

  // Compute granularity
  const rangeMs = endTime.getTime() - startTime.getTime();
  const granResult = computeGranularity(rangeMs, granularity);
  if (granResult.adjusted && granResult.notice) {
    output.log(`Notice: ${granResult.notice}`);
  }

  // Round time boundaries
  const granMs = granularity
    ? toGranularityMs(granularity)
    : toGranularityMs(getAutoGranularity(rangeMs) || '1h');
  const rounded = roundTimeBoundaries(
    startTime,
    endTime,
    granResult.adjusted
      ? toGranularityMsFromDuration(granResult.duration)
      : granMs
  );

  // Build request body
  const rollupColumn = getRollupColumnName(measure, aggregation);
  const body = {
    reason: 'agent' as const,
    scope,
    event,
    rollups: { [rollupColumn]: { measure, aggregation } },
    startTime: rounded.start.toISOString(),
    endTime: rounded.end.toISOString(),
    granularity: granResult.duration,
    ...(groupBy.length > 0 ? { groupBy } : {}),
    ...(filter ? { filter } : {}),
    limit: limit ?? 10,
    limitRanking: 'top_by_summary' as const,
    tailRollup: 'truncate' as const,
    ...(orderBy ? { orderBy } : {}),
  };

  // Make API call
  // The observability metrics API is on vercel.com, not api.vercel.com
  // In tests, client.apiUrl points to the mock server, so use that
  const baseUrl =
    client.apiUrl === 'https://api.vercel.com'
      ? 'https://vercel.com'
      : client.apiUrl;
  const metricsUrl = `${baseUrl}/api/observability/metrics`;

  output.spinner('Querying metrics...');
  let response: MetricsQueryResponse;
  try {
    response = await client.fetch<MetricsQueryResponse>(metricsUrl, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      accountId,
    });
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      return handleApiError(err, jsonOutput, client);
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    if (jsonOutput) {
      client.stdout.write(formatErrorJson('NETWORK_ERROR', errMsg));
    } else {
      output.error(errMsg);
    }
    return 1;
  }
  output.stopSpinner();

  // Format and output
  if (jsonOutput) {
    client.stdout.write(
      formatQueryJson(
        {
          event,
          measure,
          aggregation,
          groupBy,
          filter,
          startTime: rounded.start.toISOString(),
          endTime: rounded.end.toISOString(),
          granularity: granResult.duration,
        },
        response
      )
    );
  } else {
    client.stdout.write(formatCsv(response.data ?? [], groupBy, rollupColumn));
  }

  return 0;
}
