import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { metricsCommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import {
  validateOrderBy,
  validateOrderDirection,
  validateRequiredMetric,
} from './validation';
import { validateAllProjectMutualExclusivity } from '../../util/command-validation';
import {
  fetchCustomMetricCatalog,
  fetchMetricDetailOrExit,
  getDefaultAggregation,
  OBSERVABILITY_METRICS_PATH,
} from './schema-api';
import {
  formatErrorJson,
  formatQueryJson,
  getRollupColumnName,
  handleApiError,
} from './output';
import { getDefaultCustomMetricAggregation } from './metric-units';
import { formatText } from './text-output';
import { computeGranularity } from './time-utils';
import { resolveTimeRange } from '../../util/time-utils';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import { isCanonicalAggregation } from './types';
import type {
  Aggregation,
  CanonicalMetricSelection,
  CanonicalMetricsQueryRequest,
  CanonicalMetricsQueryResponse,
  Scope,
  ValidationError,
  MetricsQueryRequest,
  MetricsQueryResponse,
  OrderBy,
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
      output.print(`\nAvailable values: ${result.allowedValues.join(', ')}\n`);
    }
  }
  return 1;
}

const PRODUCTION_ENVIRONMENT_FILTER = "environment eq 'production'";
const CUSTOM_METRIC_VALUE_ALIAS = 'value';
const CUSTOM_METRIC_COUNT_ALIAS = '__seriesCount';

function combineFilters(
  filters: string[] | undefined,
  prod: boolean | undefined
): string | undefined {
  const nonEmptyFilters = [
    ...(filters?.filter(filter => filter.length > 0) ?? []),
    ...(prod ? [PRODUCTION_ENVIRONMENT_FILTER] : []),
  ];

  if (nonEmptyFilters.length === 0) {
    return undefined;
  }

  if (nonEmptyFilters.length === 1) {
    return nonEmptyFilters[0];
  }

  return nonEmptyFilters.map(filter => `(${filter})`).join(' and ');
}

function getRequestOrderBy(
  metric: string,
  aggregation: string,
  orderBy: OrderBy | undefined
): string | undefined {
  return orderBy === 'value'
    ? getRollupColumnName(metric, aggregation)
    : undefined;
}

function toBucketSeconds(granularity: MetricsQueryRequest['granularity']) {
  if ('minutes' in granularity) return granularity.minutes * 60;
  if ('hours' in granularity) return granularity.hours * 60 * 60;
  return granularity.days * 24 * 60 * 60;
}

function alignTimeRangeToGranularity(
  startTime: Date,
  endTime: Date,
  granularity: MetricsQueryRequest['granularity']
): { startTime: Date; endTime: Date } {
  const bucketMs = toBucketSeconds(granularity) * 1000;
  return {
    startTime: new Date(Math.floor(startTime.getTime() / bucketMs) * bucketMs),
    endTime: new Date(Math.ceil(endTime.getTime() / bucketMs) * bucketMs),
  };
}

function toCanonicalMetricSelection(
  metric: string,
  aggregation: string
): CanonicalMetricSelection | ValidationError {
  if (aggregation === 'persecond') {
    return { metric, aggregation: 'sum', per: 'second' };
  }
  if (aggregation === 'percent') {
    return { metric, aggregation: 'sum', normalize: 'percent' };
  }
  if (aggregation === 'unique') {
    return {
      valid: false,
      code: 'UNSUPPORTED_AGGREGATION',
      message:
        'The unique aggregation for custom metrics requires an explicit distinct dimension, which vc metrics does not support yet.',
    };
  }
  if (isCanonicalAggregation(aggregation)) {
    return { metric, aggregation };
  }
  return {
    valid: false,
    code: 'INVALID_AGGREGATION',
    message: `Aggregation "${aggregation}" is not supported for custom metrics.`,
  };
}

function createCanonicalMetricsRequest(options: {
  scope: Scope;
  metric: string;
  selection: CanonicalMetricSelection;
  startTime: Date;
  endTime: Date;
  granularity: MetricsQueryRequest['granularity'];
  groupBy: string[];
  filter: string | undefined;
  limit: number;
  orderBy: OrderBy | undefined;
  orderDirection: 'asc' | 'desc' | undefined;
}): CanonicalMetricsQueryRequest {
  const metrics: Record<string, CanonicalMetricSelection> = {
    [CUSTOM_METRIC_VALUE_ALIAS]: options.selection,
  };
  let rankMetric = CUSTOM_METRIC_VALUE_ALIAS;
  if (
    options.groupBy.length > 0 &&
    options.orderBy !== 'value' &&
    options.selection.aggregation !== 'count'
  ) {
    metrics[CUSTOM_METRIC_COUNT_ALIAS] = {
      metric: options.metric,
      aggregation: 'count',
    };
    rankMetric = CUSTOM_METRIC_COUNT_ALIAS;
  }

  return {
    scope: {
      ownerId: options.scope.ownerId,
      ...(options.scope.type === 'project'
        ? { projectIds: options.scope.projectIds }
        : {}),
    },
    timeRange: {
      start: options.startTime.toISOString(),
      end: options.endTime.toISOString(),
    },
    bucketSeconds: toBucketSeconds(options.granularity),
    ...(options.groupBy.length > 0 ? { groupBy: options.groupBy } : {}),
    ...(options.filter ? { filter: options.filter } : {}),
    metrics,
    outputs: [CUSTOM_METRIC_VALUE_ALIAS],
    ...(options.groupBy.length > 0
      ? {
          seriesSelection: {
            limit: options.limit,
            mode: 'exact',
            rankBy: [
              {
                metric: rankMetric,
                direction: options.orderDirection ?? 'desc',
              },
            ],
          },
        }
      : {}),
  };
}

function canonicalResponseToMetricsResponse(
  response: CanonicalMetricsQueryResponse,
  rollupColumn: string,
  orderBy: OrderBy | undefined,
  orderDirection: 'asc' | 'desc' | undefined
): MetricsQueryResponse {
  const toRow = (point: {
    dimensions: Record<string, string | null>;
    values: Record<string, number | null>;
  }) => ({
    ...point.dimensions,
    [rollupColumn]: point.values[CUSTOM_METRIC_VALUE_ALIAS] ?? null,
  });
  return {
    ...(response.series
      ? {
          data: response.series.map(point => ({
            timestamp: point.timestamp,
            ...toRow(point),
          })),
        }
      : {}),
    summary: response.summary.map(toRow),
    statistics: {
      rowsRead: response.meta.statistics.rowsRead,
      bytesRead: response.meta.statistics.bytesRead,
      dbTimeSeconds: response.meta.statistics.databaseElapsedMs / 1_000,
      engineTimeSeconds: response.meta.statistics.elapsedMs / 1_000,
      queryTable: [...new Set(response.meta.sources.map(source => source.id))]
        .sort()
        .join(','),
    },
    ...(orderBy ? { orderBy } : {}),
    ...(orderDirection ? { orderDirection } : {}),
  };
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
  const positionalArgs = parsedArgs.args.slice(1);
  const positionalMetric =
    positionalArgs[0] === 'query' ? positionalArgs[1] : positionalArgs[0];

  // Validate output format
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  // Extract raw flag values
  const metricFlag = positionalMetric;
  const aggregationFlag = flags['--aggregation'];
  const groupBy = flags['--group-by'] ?? [];
  const limit = flags['--limit'];
  const orderByInput =
    typeof flags['--order-by'] === 'string'
      ? flags['--order-by'].trim().toLowerCase()
      : undefined;
  const orderInput =
    typeof flags['--order'] === 'string'
      ? flags['--order'].trim().toLowerCase()
      : undefined;
  const filters = flags['--filter'];
  const prod = flags['--prod'];
  const filter = combineFilters(filters, prod);
  const since = flags['--since'];
  const until = flags['--until'];
  const granularity = flags['--granularity'];
  const bucketTimezone = flags['--bucket-timezone']?.trim();
  const project = flags['--project'];
  const all = flags['--all'];

  // Track telemetry
  telemetry.trackCliArgumentMetricId(metricFlag);
  telemetry.trackCliOptionAggregation(aggregationFlag);
  telemetry.trackCliOptionGroupBy(groupBy.length > 0 ? groupBy : undefined);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliOptionOrderBy(orderByInput);
  telemetry.trackCliOptionOrder(orderInput);
  telemetry.trackCliOptionFilter(filters);
  telemetry.trackCliFlagProd(prod);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionGranularity(granularity);
  telemetry.trackCliOptionBucketTimezone(bucketTimezone);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionFormat(flags['--format']);

  const orderByResult = validateOrderBy(orderByInput);
  if (!orderByResult.valid) {
    return handleValidationError(orderByResult, jsonOutput, client);
  }
  const orderByMode = orderByResult.value;

  // Validate that a metric id was provided.
  const requiredMetric = validateRequiredMetric(metricFlag);
  if (!requiredMetric.valid) {
    return handleValidationError(requiredMetric, jsonOutput, client);
  }
  const metric = requiredMetric.value;

  const mutualResult = validateAllProjectMutualExclusivity(all, project);
  if (!mutualResult.valid) {
    return handleValidationError(mutualResult, jsonOutput, client);
  }

  const orderDirectionResult = validateOrderDirection(orderInput);
  if (!orderDirectionResult.valid) {
    return handleValidationError(orderDirectionResult, jsonOutput, client);
  }
  const orderDirection = orderDirectionResult.value;

  const scopeResult = await resolveQueryScope(client, {
    project,
    all,
    jsonOutput,
  });
  if (typeof scopeResult === 'number') {
    return scopeResult;
  }
  const { scope, accountId, teamName, projectName } = scopeResult;

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

  const isPlatformMetric = metric.startsWith('vercel.');
  let metricUnit: string;
  let aggregationInput: string;
  let customMetricAggregations: readonly string[] | undefined;
  if (isPlatformMetric) {
    const detailOrExitCode = await fetchMetricDetailOrExit(
      client,
      accountId,
      metric,
      jsonOutput
    );
    if (typeof detailOrExitCode === 'number') {
      return detailOrExitCode;
    }
    aggregationInput =
      aggregationFlag ??
      getDefaultAggregation(detailOrExitCode, metric) ??
      'sum';
    metricUnit =
      detailOrExitCode.find(item => item.id === metric)?.unit ?? 'count';
  } else {
    const customMetric = await fetchCustomMetricCatalog(
      client,
      accountId,
      metric,
      startTime.toISOString()
    )
      .then(metrics => metrics.find(item => item.id === metric))
      .catch(() => undefined);
    metricUnit = customMetric?.unit ?? 'units';
    customMetricAggregations = customMetric?.aggregations;
    aggregationInput =
      aggregationFlag ??
      getDefaultCustomMetricAggregation(metricUnit, customMetricAggregations);
  }
  const aggregation = aggregationInput;
  const orderBy = getRequestOrderBy(metric, aggregation, orderByMode);

  // Compute granularity — may adjust the user's --granularity upward if it's
  // too fine for the time range (granResult.adjusted will be true in that case).
  const rangeMs = endTime.getTime() - startTime.getTime();
  const granResult = computeGranularity(rangeMs, granularity);
  const queryTimeRange = isPlatformMetric
    ? { startTime, endTime }
    : alignTimeRangeToGranularity(startTime, endTime, granResult.duration);
  if (!jsonOutput && granResult.adjusted && granResult.notice) {
    output.log(`Notice: ${granResult.notice}`);
  }

  let body: MetricsQueryRequest | CanonicalMetricsQueryRequest;
  if (isPlatformMetric) {
    body = {
      scope,
      metric,
      aggregation: aggregation as Aggregation,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      granularity: granResult.duration,
      ...(bucketTimezone ? { bucketTimezone } : {}),
      ...(groupBy.length > 0 ? { groupBy } : {}),
      ...(filter ? { filter } : {}),
      limit: limit ?? 10,
      ...(orderBy ? { orderBy } : {}),
      ...(orderDirection ? { orderDirection } : {}),
    };
  } else {
    if (bucketTimezone) {
      return handleValidationError(
        {
          valid: false,
          code: 'UNSUPPORTED_BUCKET_TIMEZONE',
          message: '--bucket-timezone is not supported for custom metrics yet.',
        },
        jsonOutput,
        client
      );
    }
    const selection = toCanonicalMetricSelection(metric, aggregation);
    if ('valid' in selection) {
      return handleValidationError(selection, jsonOutput, client);
    }
    const supportedAggregation = selection.aggregation;
    if (
      customMetricAggregations &&
      !customMetricAggregations.includes(supportedAggregation)
    ) {
      return handleValidationError(
        {
          valid: false,
          code: 'INVALID_AGGREGATION',
          message: `Aggregation "${aggregation}" is not valid for custom metric "${metric}".`,
          allowedValues: [...customMetricAggregations],
        },
        jsonOutput,
        client
      );
    }
    body = createCanonicalMetricsRequest({
      scope,
      metric,
      selection,
      startTime: queryTimeRange.startTime,
      endTime: queryTimeRange.endTime,
      granularity: granResult.duration,
      groupBy,
      filter,
      limit: limit ?? 10,
      orderBy: orderByMode,
      orderDirection,
    });
  }

  if (!jsonOutput) {
    output.spinner('Querying metrics...');
  }
  let response: MetricsQueryResponse;
  try {
    if (isPlatformMetric) {
      response = await client.fetch<MetricsQueryResponse>(
        '/v2/observability/query',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
          accountId,
          bailOn429: true,
        }
      );
    } else {
      const canonicalResponse =
        await client.fetch<CanonicalMetricsQueryResponse>(
          OBSERVABILITY_METRICS_PATH,
          {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
            accountId,
            bailOn429: true,
          }
        );
      response = canonicalResponseToMetricsResponse(
        canonicalResponse,
        getRollupColumnName(metric, aggregation),
        groupBy.length > 0 ? (orderByMode ?? 'count') : undefined,
        groupBy.length > 0 ? (orderDirection ?? 'desc') : undefined
      );
    }
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
    if (!jsonOutput) {
      output.stopSpinner();
    }
  }

  if (jsonOutput) {
    client.stdout.write(
      formatQueryJson(
        {
          metric,
          aggregation: aggregation as Aggregation,
          groupBy,
          filter,
          startTime: queryTimeRange.startTime.toISOString(),
          endTime: queryTimeRange.endTime.toISOString(),
          granularity: granResult.duration,
          ...(bucketTimezone ? { bucketTimezone } : {}),
          ...(orderByMode ? { orderBy: orderByMode } : {}),
          ...(orderDirection ? { orderDirection } : {}),
        },
        response
      )
    );
  } else {
    client.stdout.write(
      formatText(response, {
        metric,
        metricUnit,
        aggregation: aggregation as Aggregation,
        groupBy,
        filter,
        scope,
        projectName,
        teamName,
        periodStart: queryTimeRange.startTime.toISOString(),
        periodEnd: queryTimeRange.endTime.toISOString(),
        granularity: granResult.duration,
        bucketTimezone: bucketTimezone,
        orderBy: orderByMode,
        orderDirection,
      })
    );
  }

  return 0;
}
