import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { metricsCommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import {
  validateRequiredEvent,
  validateEvent,
  validateMeasure,
  validateAggregation,
  validateGroupBy,
  validateMutualExclusivity,
} from './validation';
import {
  getDefaultAggregation,
  getMeasures,
  getQueryEngineEventName,
  getApiMeasureName,
  getApiDimensionName,
  convertFilterToApiNames,
  parseEventMeasure,
  fetchSchemaOrExit,
} from './schema-api';
import {
  formatQueryJson,
  formatErrorJson,
  getRollupColumnName,
} from './output';
import { formatText } from './text-output';
import {
  computeGranularity,
  roundTimeBoundaries,
  toGranularityMsFromDuration,
} from './time-utils';
import { resolveTimeRange } from '../../util/time-utils';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import type {
  Scope,
  ValidationError,
  MetricsQueryRequest,
  MetricsQueryResponse,
} from './types';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import getScope from '../../util/get-scope';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';

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
): Promise<
  | {
      scope: Scope;
      accountId: string;
      teamName?: string;
      projectName?: string;
    }
  | number
> {
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
        scope: { type: 'owner', ownerId: team.id },
        accountId: team.id,
        teamName: team.slug,
      };
    }

    const project = await getProjectByNameOrId(client, opts.project!, team.id);
    if (project instanceof ProjectNotFound) {
      const errMsg = `Project "${opts.project}" was not found in team "${team.slug}".`;
      if (opts.jsonOutput) {
        client.stdout.write(formatErrorJson('PROJECT_NOT_FOUND', errMsg));
      } else {
        output.error(errMsg);
      }
      return 1;
    }

    return {
      scope: {
        type: 'project',
        ownerId: team.id,
        projectIds: [project.id],
      },
      accountId: team.id,
      teamName: team.slug,
      projectName: project.name,
    };
  }

  // Default: use linked project
  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }
  if (linkedProject.status === 'not_linked') {
    const errMsg =
      'No linked project found. Run `vercel link` to link a project, or use --project <name-or-id> or --all.';
    if (opts.jsonOutput) {
      client.stdout.write(formatErrorJson('NOT_LINKED', errMsg));
    } else {
      output.error(errMsg);
    }
    return 1;
  }

  return {
    scope: {
      type: 'project',
      ownerId: linkedProject.org.id,
      projectIds: [linkedProject.project.id],
    },
    accountId: linkedProject.org.id,
    teamName: linkedProject.org.slug,
    projectName: linkedProject.project.name,
  };
}

export default async function query(
  client: Client,
  telemetry: MetricsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(metricsCommand.options);
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
  const measureFlag = flags['--measure'];
  const aggregationFlag = flags['--aggregation'];
  const groupBy = flags['--group-by'] ?? [];
  const limit = flags['--limit'];
  const filter = flags['--filter'];
  const since = flags['--since'];
  const until = flags['--until'];
  const granularity = flags['--granularity'];
  const project = flags['--project'];
  const all = flags['--all'];

  // Track telemetry
  telemetry.trackCliOptionEvent(eventFlag);
  telemetry.trackCliOptionMeasure(measureFlag);
  telemetry.trackCliOptionAggregation(aggregationFlag);
  telemetry.trackCliOptionGroupBy(groupBy.length > 0 ? groupBy : undefined);
  telemetry.trackCliOptionLimit(limit);
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

  // Parse embedded measure from event (e.g. vercel.edge_request.count)
  const parsed = parseEventMeasure(requiredResult.value);
  const event = parsed.event;

  if (parsed.measure && measureFlag) {
    const errMsg =
      'Cannot specify --measure when the event already includes a measure. ' +
      `Use either "--event ${parsed.event} --measure ${measureFlag}" or "--event ${requiredResult.value}".`;
    if (jsonOutput) {
      client.stdout.write(formatErrorJson('MEASURE_CONFLICT', errMsg));
    } else {
      output.error(errMsg);
    }
    return 1;
  }

  const measure = parsed.measure ?? measureFlag ?? 'count';

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
  const { scope, accountId, teamName, projectName } = scopeResult;

  const schemaData = await fetchSchemaOrExit(client, accountId, jsonOutput);
  if (typeof schemaData === 'number') {
    return schemaData;
  }

  const aggregationInput =
    aggregationFlag ?? getDefaultAggregation(schemaData, event, measure);

  const eventResult = validateEvent(schemaData, event);
  if (!eventResult.valid) {
    return handleValidationError(eventResult, jsonOutput, client);
  }

  const measureResult = validateMeasure(schemaData, event, measure);
  if (!measureResult.valid) {
    return handleValidationError(measureResult, jsonOutput, client);
  }

  const aggResult = validateAggregation(
    schemaData,
    event,
    measure,
    aggregationInput
  );
  if (!aggResult.valid) {
    return handleValidationError(aggResult, jsonOutput, client);
  }
  const aggregation = aggResult.value;

  const groupByResult = validateGroupBy(schemaData, event, groupBy);
  if (!groupByResult.valid) {
    return handleValidationError(groupByResult, jsonOutput, client);
  }

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

  // Compute granularity — may adjust the user's --granularity upward if it's
  // too fine for the time range (granResult.adjusted will be true in that case).
  const rangeMs = endTime.getTime() - startTime.getTime();
  const granResult = computeGranularity(rangeMs, granularity);
  if (granResult.adjusted && granResult.notice) {
    output.log(`Notice: ${granResult.notice}`);
  }

  // Round start/end to granularity boundaries so every time bucket is complete.
  // e.g. granularity=1h with range 14:23–16:47 rounds to 14:00–17:00.
  const rounded = roundTimeBoundaries(
    startTime,
    endTime,
    toGranularityMsFromDuration(granResult.duration)
  );

  // Build request body — convert CLI names to API names for the query engine
  const apiMeasure = getApiMeasureName(schemaData, event, measure);
  const apiGroupBy = groupBy.map(dim =>
    getApiDimensionName(schemaData, event, dim)
  );
  const apiFilter = filter
    ? convertFilterToApiNames(schemaData, event, filter)
    : undefined;
  const rollupColumn = getRollupColumnName(measure, aggregation);
  const body: MetricsQueryRequest = {
    reason: 'agent' as const,
    scope,
    event: getQueryEngineEventName(schemaData, event),
    rollups: { [rollupColumn]: { measure: apiMeasure, aggregation } },
    startTime: rounded.start.toISOString(),
    endTime: rounded.end.toISOString(),
    granularity: granResult.duration,
    ...(apiGroupBy.length > 0 ? { groupBy: apiGroupBy } : {}),
    ...(apiFilter ? { filter: apiFilter } : {}),
    limit: limit ?? 10,
  };

  output.spinner('Querying metrics...');
  let response: MetricsQueryResponse;
  try {
    response = await client.fetch<MetricsQueryResponse>(
      '/v1/observability/query',
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        accountId,
      }
    );
  } catch (err: unknown) {
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
  } finally {
    output.stopSpinner();
  }

  // Rename API groupBy columns back to CLI names in response data
  if (apiGroupBy.length > 0) {
    const columnMap = new Map(apiGroupBy.map((api, i) => [api, groupBy[i]]));
    const renameColumns = (rows: typeof response.data): typeof response.data =>
      rows?.map(row => {
        const renamed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          renamed[columnMap.get(key) ?? key] = value;
        }
        return renamed as typeof row;
      });
    response = {
      ...response,
      data: renameColumns(response.data),
      summary: renameColumns(
        response.summary as typeof response.data
      ) as typeof response.summary,
    };
  }

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
    const measureUnit = getMeasures(schemaData, event).find(
      m => m.name === measure
    )?.unit;
    client.stdout.write(
      formatText(response, {
        event,
        measure,
        measureUnit,
        aggregation,
        groupBy,
        filter,
        scope,
        projectName,
        teamName,
        periodStart: rounded.start.toISOString(),
        periodEnd: rounded.end.toISOString(),
        granularity: granResult.duration,
      })
    );
  }

  return 0;
}
