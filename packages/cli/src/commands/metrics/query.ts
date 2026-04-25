import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { metricsCommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import {
  validateMutualExclusivity,
  validateRequiredMetric,
} from './validation';
import { fetchMetricDetailOrExit, getDefaultAggregation } from './schema-api';
import { formatErrorJson, formatQueryJson, handleApiError } from './output';
import { formatText } from './text-output';
import {
  computeGranularity,
  roundTimeBoundaries,
  toGranularityMsFromDuration,
} from './time-utils';
import { resolveTimeRange } from '../../util/time-utils';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import type {
  Aggregation,
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
  const filter = flags['--filter'];
  const since = flags['--since'];
  const until = flags['--until'];
  const granularity = flags['--granularity'];
  const project = flags['--project'];
  const all = flags['--all'];

  // Track telemetry
  telemetry.trackCliArgumentMetricId(metricFlag);
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

  // Validate that a metric id was provided.
  const requiredMetric = validateRequiredMetric(metricFlag);
  if (!requiredMetric.valid) {
    return handleValidationError(requiredMetric, jsonOutput, client);
  }
  const metric = requiredMetric.value;

  const mutualResult = validateMutualExclusivity(all, project);
  if (!mutualResult.valid) {
    return handleValidationError(mutualResult, jsonOutput, client);
  }

  const scopeResult = await resolveQueryScope(client, {
    project,
    all,
    jsonOutput,
  });
  if (typeof scopeResult === 'number') {
    return scopeResult;
  }
  const { scope, accountId, teamName, projectName } = scopeResult;

  const detailOrExitCode = await fetchMetricDetailOrExit(
    client,
    accountId,
    metric,
    jsonOutput
  );
  // fetchMetricDetailOrExit() returns a numeric exit code when it already
  // handled the error output for us.
  if (typeof detailOrExitCode === 'number') {
    return detailOrExitCode;
  }

  const aggregationInput =
    aggregationFlag ?? getDefaultAggregation(detailOrExitCode, metric) ?? 'sum';
  const aggregation = aggregationInput;

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

  // Build request body
  const body: MetricsQueryRequest = {
    scope,
    metric,
    aggregation: aggregation as Aggregation,
    startTime: rounded.start.toISOString(),
    endTime: rounded.end.toISOString(),
    granularity: granResult.duration,
    ...(groupBy.length > 0 ? { groupBy } : {}),
    ...(filter ? { filter } : {}),
    limit: limit ?? 10,
  };

  output.spinner('Querying metrics...');
  let response: MetricsQueryResponse;
  try {
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

  // Format and output
  if (jsonOutput) {
    client.stdout.write(
      formatQueryJson(
        {
          metric,
          aggregation: aggregation as Aggregation,
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
    client.stdout.write(
      formatText(response, {
        metric,
        metricUnit:
          detailOrExitCode.find(item => item.id === metric)?.unit ?? 'count',
        aggregation: aggregation as Aggregation,
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
