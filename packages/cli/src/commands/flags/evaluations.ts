import type Client from '../../util/client';
import { outputError } from '../../util/command-validation';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getFlag } from '../../util/flags/get-flags';
import { formatVariantListSummary } from '../../util/flags/resolve-variant';
import type { Flag } from '../../util/flags/types';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { getCommandName } from '../../util/pkg-name';
import { FlagsEvaluationsTelemetryClient } from '../../util/telemetry/commands/flags/evaluations';
import { resolveTimeRange } from '../../util/time-utils';
import output from '../../output-manager';
import { getRollupColumnName, handleApiError } from '../metrics/output';
import { formatText } from '../metrics/text-output';
import {
  computeGranularity,
  toGranularityMsFromDuration,
} from '../metrics/time-utils';
import type {
  Granularity,
  MetricsQueryResponse,
  ProjectScope,
} from '../metrics/types';
import { evaluationsSubcommand } from './command';
import {
  FLAG_EVALUATIONS_GRANULARITIES,
  isFlagEvaluationsGranularity,
} from './evaluations-config';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';

const FLAG_EVALUATIONS_API_URL = 'https://vercel.com/api/observability/metrics';
const FLAG_EVALUATIONS_METRIC = 'vercel.flag_evaluation.flag_evaluations';
const FLAG_EVALUATIONS_AGGREGATION = 'sum';
const FLAG_EVALUATIONS_ROLLUP = getRollupColumnName(
  FLAG_EVALUATIONS_METRIC,
  FLAG_EVALUATIONS_AGGREGATION
);
const DISPLAY_GROUP_BY = 'Variants';
const QUERY_ENGINE_GROUP_BY = 'flagVariant';
const MAX_VARIANTS = 100;

function getFlagEvaluationsApiUrl(ownerId: string): string {
  const url = new URL(
    process.env.VERCEL_FLAG_EVALUATIONS_API_URL || FLAG_EVALUATIONS_API_URL
  );
  url.searchParams.set('ownerId', ownerId);
  return url.href;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function alignTimeRange(
  startTime: Date,
  endTime: Date,
  granularity: Granularity
): { startTime: Date; endTime: Date } {
  const granularityMs = toGranularityMsFromDuration(granularity);
  return {
    startTime: new Date(
      Math.floor(startTime.getTime() / granularityMs) * granularityMs
    ),
    endTime: new Date(
      Math.ceil(endTime.getTime() / granularityMs) * granularityMs
    ),
  };
}

function getVariantDisplayName(flag: Flag, variantId: string): string {
  if (!variantId || variantId === '(not set)') {
    return 'Default in Code';
  }

  const variant = flag.variants.find(item => item.id === variantId);
  return variant ? formatVariantListSummary(variant) : variantId;
}

function handleCommandError(
  client: Client,
  error: unknown,
  jsonOutput: boolean
): number {
  if (!jsonOutput) {
    printError(error);
    return 1;
  }

  if (isAPIError(error)) {
    return outputError(
      client,
      true,
      error.code || 'API_ERROR',
      error.serverMessage || `API error (${error.status}).`
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return outputError(client, true, 'UNEXPECTED_ERROR', message);
}

function handleMetricsQueryError(
  client: Client,
  error: unknown,
  jsonOutput: boolean
): number {
  return isAPIError(error)
    ? handleApiError(error, jsonOutput, client)
    : handleCommandError(client, error, jsonOutput);
}

function limitEvaluationVariants(response: MetricsQueryResponse): {
  response: MetricsQueryResponse;
  truncated: boolean;
} {
  if (response.summary.length <= MAX_VARIANTS) {
    return { response, truncated: false };
  }

  const summary = response.summary.slice(0, MAX_VARIANTS);
  const visibleVariants = new Set(
    summary.map(row => row[QUERY_ENGINE_GROUP_BY])
  );
  return {
    response: {
      ...response,
      summary,
      data: response.data?.filter(row =>
        visibleVariants.has(row[QUERY_ENGINE_GROUP_BY])
      ),
    },
    truncated: true,
  };
}

function formatEvaluationsJson(
  flag: Flag,
  response: MetricsQueryResponse,
  startTime: Date,
  endTime: Date,
  granularity: Granularity,
  truncated: boolean
): string {
  return `${JSON.stringify(
    {
      flag: flag.slug,
      variants: Object.fromEntries(
        flag.variants.map(({ id, value }) => [id, value])
      ),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      granularity,
      truncated,
      buckets: (response.data ?? []).map(row => ({
        timestamp: row.timestamp,
        variant: row[QUERY_ENGINE_GROUP_BY] ?? null,
        evaluations: row[FLAG_EVALUATIONS_ROLLUP] ?? null,
      })),
    },
    null,
    2
  )}\n`;
}

export default async function evaluations(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new FlagsEvaluationsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    evaluationsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArgument] = args;
  const projectName = getProjectNameFromFlags(flags);
  const since = flags['--since'];
  const until = flags['--until'];
  const granularity = flags['--granularity'];

  telemetry.trackCliArgumentFlag(flagArgument);
  telemetry.trackCliOptionProject(projectName);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionGranularity(granularity);
  telemetry.trackCliFlagJson(flags['--json']);

  const jsonOutput = flags['--json'] ?? false;

  if (!flagArgument) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_FLAG',
      `Missing required argument: flag. Usage: ${getCommandName('flags evaluations <flag>')}`
    );
  }

  if (granularity && !isFlagEvaluationsGranularity(granularity)) {
    return outputError(
      client,
      jsonOutput,
      'INVALID_GRANULARITY',
      `Invalid granularity "${granularity}". Use one of: ${FLAG_EVALUATIONS_GRANULARITIES.join(', ')}.`
    );
  }

  let startTime: Date;
  let endTime: Date;
  let resolvedGranularity: ReturnType<typeof computeGranularity>;
  try {
    ({ startTime, endTime } = resolveTimeRange(since, until));
    if (startTime.getTime() >= endTime.getTime()) {
      throw new Error('The start time must be before the end time.');
    }
    resolvedGranularity = computeGranularity(
      endTime.getTime() - startTime.getTime(),
      granularity
    );
    ({ startTime, endTime } = alignTimeRange(
      startTime,
      endTime,
      resolvedGranularity.duration
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return outputError(client, jsonOutput, 'INVALID_TIME', message);
  }

  if (
    !jsonOutput &&
    resolvedGranularity.adjusted &&
    resolvedGranularity.notice
  ) {
    output.log(`Notice: ${resolvedGranularity.notice}`);
  }

  let link: Awaited<ReturnType<typeof getLinkedFlagsProject>>;
  try {
    link = await getLinkedFlagsProject(client, projectName, {
      projectNotFoundHandling: jsonOutput ? 'return' : 'report',
    });
  } catch (error) {
    return handleCommandError(client, error, jsonOutput);
  }
  if (link.status === 'error') {
    return jsonOutput
      ? outputError(
          client,
          true,
          'PROJECT_RESOLUTION_FAILED',
          'Unable to resolve the requested Vercel project.'
        )
      : link.exitCode;
  }
  if (link.status === 'not_linked') {
    const code = projectName ? 'PROJECT_NOT_FOUND' : 'NOT_LINKED';
    const message = projectName
      ? `Project "${projectName}" was not found in the current scope.`
      : `Your codebase isn't linked to a project on Vercel. Pass --project <name>, or run ${getCommandName('link')} to link it.`;
    return outputError(client, jsonOutput, code, message);
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project, org } = link;
  let flag: Flag;
  try {
    flag = await getFlag(client, project.id, flagArgument);
  } catch (error) {
    return handleCommandError(client, error, jsonOutput);
  }

  if (!jsonOutput) {
    output.spinner('Querying flag evaluations...');
  }

  const scope: ProjectScope = {
    type: 'project',
    ownerId: org.id,
    projectIds: [project.id],
  };
  let response: MetricsQueryResponse;
  try {
    const body = {
      scope,
      reason: 'flag_evaluation_chart',
      event: 'flagEvaluation',
      rollups: {
        [FLAG_EVALUATIONS_ROLLUP]: {
          measure: 'flagEvaluations',
          aggregation: 'sum',
        },
      },
      orderBy: FLAG_EVALUATIONS_ROLLUP,
      orderDirection: 'desc',
      groupBy: [QUERY_ENGINE_GROUP_BY],
      // Fetch one extra variant so output can disclose truncation reliably.
      limit: MAX_VARIANTS + 1,
      limitRanking: 'single_pass',
      tailRollup: 'truncate',
      summaryOnly: false,
      filter: `flagKey eq '${escapeODataString(flag.slug)}'`,
      granularity: resolvedGranularity.duration,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };

    response = await client.fetch<MetricsQueryResponse>(
      getFlagEvaluationsApiUrl(org.id),
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        useCurrentTeam: false,
        bailOn429: true,
      }
    );
  } catch (error) {
    return handleMetricsQueryError(client, error, jsonOutput);
  } finally {
    if (!jsonOutput) {
      output.stopSpinner();
    }
  }

  const limited = limitEvaluationVariants(response);

  if (jsonOutput) {
    client.stdout.write(
      formatEvaluationsJson(
        flag,
        limited.response,
        startTime,
        endTime,
        resolvedGranularity.duration,
        limited.truncated
      )
    );
  } else {
    if (limited.truncated) {
      output.warn(
        `Results are limited to the ${MAX_VARIANTS} most evaluated variants.`
      );
    }
    client.stdout.write(
      formatText(
        {
          ...limited.response,
          data: limited.response.data?.map(row => ({
            ...row,
            [DISPLAY_GROUP_BY]: row[QUERY_ENGINE_GROUP_BY] ?? null,
          })),
        },
        {
          metric: FLAG_EVALUATIONS_METRIC,
          metricUnit: 'count',
          aggregation: FLAG_EVALUATIONS_AGGREGATION,
          groupBy: [DISPLAY_GROUP_BY],
          scope,
          projectName: project.name,
          teamName: org.slug,
          periodStart: startTime.toISOString(),
          periodEnd: endTime.toISOString(),
          granularity: resolvedGranularity.duration,
          presentation: {
            compact: true,
            formatGroupValue: (_field, value) =>
              getVariantDisplayName(flag, value),
          },
        }
      )
    );
  }

  return 0;
}
