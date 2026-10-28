import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import table from '../../util/output/table';
import { parseJsonObjectFlag } from '../../util/kms/parse-json-input';
import { validateJsonOutput } from '../../util/output-format';
import { validateAllProjectMutualExclusivity } from '../../util/command-validation';
import { resolveTimeRange } from '../../util/time-utils';
import { isAPIError } from '../../util/errors-ts';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import { metricsCommand } from './command';
import { OBSERVABILITY_METRICS_PATH } from './schema-api';
import { formatErrorJson, handleApiError } from './output';
import { formatDecimal } from './text-output';
import { handleValidationError, resolveQueryScope } from './query';
import type { CanonicalMetricsQueryResponse } from './types';

// Flags that shape a single-metric query. With --body, the JSON body is the
// whole query, so these would be silently ignored.
const QUERY_SHAPE_FLAGS = [
  '--aggregation',
  '--group-by',
  '--limit',
  '--order-by',
  '--order',
  '--query',
  '--filter',
  '--environment',
  '--prod',
  '--granularity',
  '--bucket-timezone',
] as const;

/**
 * Runs a raw `/metrics/v1` query body, which supports multiple metrics and
 * formulas. The body is sent as-is; `scope` and `timeRange` are filled from
 * the linked project, `--project`/`--all`, and `--since`/`--until` only when
 * the body leaves them out.
 */
export default async function rawQuery(
  client: Client,
  telemetry: MetricsTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(metricsCommand.options)
    );
  } catch (err) {
    telemetry.trackCliError('INVALID_ARGUMENTS');
    printError(err, client);
    return 2;
  }
  const flags = parsedArgs.flags;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    telemetry.trackCliError('INVALID_OUTPUT_FORMAT');
    output.error(formatResult.error);
    return 2;
  }
  const jsonOutput = formatResult.jsonOutput;

  const since = flags['--since'];
  const until = flags['--until'];
  const project = flags['--project'];
  const all = flags['--all'];
  telemetry.trackCliOptionBody(flags['--body']);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionFormat(flags['--format']);

  const usageError = (code: string, message: string) => {
    handleValidationError(
      { valid: false, code, message },
      jsonOutput,
      client,
      telemetry
    );
    return 2;
  };

  const positional = parsedArgs.args.slice(1);
  const metricArg = positional[0] === 'query' ? positional[1] : positional[0];
  if (metricArg) {
    return usageError(
      'CONFLICTING_OPTIONS',
      `Can't use a metric argument with --body. Put "${metricArg}" in the body's "metrics" instead.`
    );
  }
  const conflicting = QUERY_SHAPE_FLAGS.filter(
    flag => flags[flag] !== undefined
  );
  if (conflicting.length > 0) {
    return usageError(
      'CONFLICTING_OPTIONS',
      `Can't use ${conflicting.join(', ')} with --body. Put the equivalent fields in the JSON body instead.`
    );
  }
  const mutualResult = validateAllProjectMutualExclusivity(all, project);
  if (!mutualResult.valid) {
    return handleValidationError(mutualResult, jsonOutput, client, telemetry);
  }

  let body: JSONObject;
  try {
    body = await parseJsonObjectFlag(client, '--body', flags['--body']!);
  } catch (err) {
    return usageError(
      'INVALID_BODY',
      err instanceof Error ? err.message : String(err)
    );
  }

  if (body.scope !== undefined && (project || all)) {
    return usageError(
      'CONFLICTING_OPTIONS',
      `Can't use ${project ? '--project' : '--all'} when the body sets "scope".`
    );
  }
  if (body.timeRange !== undefined && (since || until)) {
    return usageError(
      'CONFLICTING_OPTIONS',
      `Can't use ${since ? '--since' : '--until'} when the body sets "timeRange".`
    );
  }

  let accountId: string;
  let teamName: string | undefined;
  let projectName: string | undefined;
  if (body.scope === undefined) {
    const scopeResult = await resolveQueryScope(client, telemetry, {
      project,
      all,
      jsonOutput,
    });
    if (typeof scopeResult === 'number') {
      return scopeResult;
    }
    const { scope } = scopeResult;
    ({ accountId, teamName, projectName } = scopeResult);
    body.scope = {
      ownerId: scope.ownerId,
      ...(scope.type === 'project' ? { projectIds: scope.projectIds } : {}),
    };
  } else {
    const ownerId = (body.scope as JSONObject | null)?.ownerId;
    if (typeof ownerId !== 'string' || ownerId.length === 0) {
      return usageError(
        'INVALID_BODY',
        'The body\'s "scope" needs an "ownerId". Leave "scope" out to use the linked project, --project, or --all.'
      );
    }
    accountId = ownerId;
  }

  if (body.timeRange === undefined) {
    let startTime: Date;
    let endTime: Date;
    try {
      ({ startTime, endTime } = resolveTimeRange(since, until));
    } catch (err) {
      return usageError(
        'INVALID_TIME',
        err instanceof Error ? err.message : String(err)
      );
    }
    // Align to whole buckets, as the single-metric query does.
    if (typeof body.bucketSeconds === 'number' && body.bucketSeconds > 0) {
      const bucketMs = body.bucketSeconds * 1000;
      startTime = new Date(
        Math.floor(startTime.getTime() / bucketMs) * bucketMs
      );
      endTime = new Date(Math.ceil(endTime.getTime() / bucketMs) * bucketMs);
    }
    body.timeRange = {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
    };
  }

  if (!jsonOutput) {
    output.spinner('Querying metrics...');
  }
  let response: CanonicalMetricsQueryResponse;
  try {
    response = await client.fetch<CanonicalMetricsQueryResponse>(
      OBSERVABILITY_METRICS_PATH,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        accountId,
        bailOn429: true,
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      telemetry.trackCliError(err.code ?? 'API_ERROR', err.status);
      return handleApiError(
        err,
        jsonOutput,
        client,
        {},
        {
          scope: accountId.startsWith('team_')
            ? teamName || accountId
            : undefined,
          projectName,
        }
      );
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    telemetry.trackCliError('NETWORK_ERROR');
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
    client.stdout.write(JSON.stringify({ query: body, ...response }, null, 2));
  } else {
    client.stdout.write(formatSummary(body, response));
  }
  return 0;
}

/** One row per group, one column per dimension and output. */
function formatSummary(
  body: JSONObject,
  response: CanonicalMetricsQueryResponse
): string {
  const rows = response.summary ?? [];
  if (rows.length === 0) {
    return 'No data for this query.\n';
  }
  const dimensions = Array.isArray(body.groupBy)
    ? body.groupBy.map(String)
    : [...new Set(rows.flatMap(row => Object.keys(row.dimensions)))];
  const outputs = Array.isArray(body.outputs)
    ? body.outputs.map(String)
    : [...new Set(rows.flatMap(row => Object.keys(row.values)))];
  const formatValue = (value: number | null | undefined) =>
    typeof value === 'number' ? formatDecimal(value) : '-';

  const lines = table(
    [
      [...dimensions, ...outputs],
      ...rows.map(row => [
        ...dimensions.map(dimension => row.dimensions[dimension] ?? '-'),
        ...outputs.map(alias => formatValue(row.values[alias])),
      ]),
    ],
    {
      align: [
        ...dimensions.map(() => 'l' as const),
        ...outputs.map(() => 'r' as const),
      ],
    }
  );
  return `${lines}\n\nShowing totals for the time range. Use --format json for the full response, including the time series.\n`;
}
