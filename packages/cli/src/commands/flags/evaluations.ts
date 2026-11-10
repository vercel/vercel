import type Client from '../../util/client';
import { outputError } from '../../util/command-validation';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getFlag } from '../../util/flags/get-flags';
import { formatVariantListSummary } from '../../util/flags/resolve-variant';
import { getSdkKeys } from '../../util/flags/sdk-keys';
import {
  FLAG_EVALUATIONS_AGGREGATION,
  FLAG_EVALUATIONS_METRIC,
} from '../../util/flags/flag-evaluations';
import type { Flag, SdkKey } from '../../util/flags/types';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { getCommandName } from '../../util/pkg-name';
import { FlagsEvaluationsTelemetryClient } from '../../util/telemetry/commands/flags/evaluations';
import { resolveTimeRange } from '../../util/time-utils';
import output from '../../output-manager';
import {
  alignTimeRangeToGranularity,
  canonicalResponseToMetricsResponse,
  createCanonicalMetricsRequest,
} from '../metrics/canonical-query';
import { getRollupColumnName, handleApiError } from '../metrics/output';
import { OBSERVABILITY_METRICS_PATH } from '../metrics/schema-api';
import { formatText } from '../metrics/text-output';
import { computeGranularity } from '../metrics/time-utils';
import type {
  CanonicalMetricsQueryResponse,
  Granularity,
  MetricsApiDataCell,
  MetricsQueryResponse,
  ProjectScope,
} from '../metrics/types';
import { evaluationsSubcommand } from './command';
import {
  FLAG_EVALUATIONS_DIMENSION_NAMES,
  FLAG_EVALUATIONS_DIMENSIONS,
  FLAG_EVALUATIONS_GRANULARITIES,
  type FlagEvaluationsDimension,
  isFlagEvaluationsDimension,
  isFlagEvaluationsGranularity,
} from './evaluations-config';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';

const FLAG_EVALUATIONS_ROLLUP = getRollupColumnName(
  FLAG_EVALUATIONS_METRIC,
  FLAG_EVALUATIONS_AGGREGATION
);
const MAX_GROUPS = 100;
const DEFAULT_IN_CODE_VARIANT = 'Default in Code';
const PERSONAL_ACCOUNT_MESSAGE =
  'Flag evaluations are available for team-owned projects only. Select a team with --scope <team>.';
// The Observability API answers every authorization failure with a bare
// "Forbidden". Flag evaluations require Read ProjectFlags, so name it.
const FORBIDDEN_MESSAGE =
  'You do not have permission to read feature flags for this project, which flag evaluations require.';

function getCellValue(cell: MetricsApiDataCell | undefined): string {
  return cell === undefined || cell === null ? '' : String(cell);
}

// Grouping values (client names, SDK key labels, variant ids) are reported
// by SDKs and set by team members, so they are not trusted terminal output.
function sanitizeGroupValue(value: string): string {
  return sanitizeForTerminal(value).replace(/\p{Cc}/gu, '');
}

function getEvaluationVariantValue(flag: Flag, variantId: string): unknown {
  if (!variantId) {
    return DEFAULT_IN_CODE_VARIANT;
  }

  return flag.variants.find(variant => variant.id === variantId)?.value ?? null;
}

function getVariantDisplayName(flag: Flag, variantId: string): string {
  if (
    !variantId ||
    variantId === '(not set)' ||
    variantId === DEFAULT_IN_CODE_VARIANT
  ) {
    return DEFAULT_IN_CODE_VARIANT;
  }

  const variant = flag.variants.find(item => item.id === variantId);
  return variant ? formatVariantListSummary(variant) : variantId;
}

function getSdkKeyLabel(sdkKey: SdkKey): string {
  return sdkKey.label
    ? `${sdkKey.label} (${sdkKey.environment})`
    : `${sdkKey.environment} ${sdkKey.type} key`;
}

function getSdkKeyDisplayName(
  sdkKeys: Map<string, SdkKey>,
  hashKey: string
): string {
  if (!hashKey) {
    return '(not set)';
  }
  const sdkKey = sdkKeys.get(hashKey);
  return sdkKey
    ? getSdkKeyLabel(sdkKey)
    : `${hashKey} (unknown or deleted key)`;
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
  if (!isAPIError(error)) {
    return handleCommandError(client, error, jsonOutput);
  }
  const genericForbidden =
    error.status === 403 &&
    (!error.serverMessage ||
      error.serverMessage === 'Forbidden' ||
      error.serverMessage === 'Response Error');
  return handleApiError(
    error,
    jsonOutput,
    client,
    genericForbidden
      ? { 403: { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE } }
      : {}
  );
}

function getGroupKey(
  row: Record<string, MetricsApiDataCell | undefined>,
  fields: string[]
): string {
  return JSON.stringify(fields.map(field => getCellValue(row[field])));
}

function limitEvaluationGroups(
  response: MetricsQueryResponse,
  fields: string[]
): {
  response: MetricsQueryResponse;
  truncated: boolean;
} {
  if (response.summary.length <= MAX_GROUPS) {
    return { response, truncated: false };
  }

  const summary = response.summary.slice(0, MAX_GROUPS);
  const visibleGroups = new Set(summary.map(row => getGroupKey(row, fields)));
  return {
    response: {
      ...response,
      summary,
      data: response.data?.filter(row =>
        visibleGroups.has(getGroupKey(row, fields))
      ),
    },
    truncated: true,
  };
}

function formatEvaluationsJson(
  flag: Flag | undefined,
  dimensions: FlagEvaluationsDimension[],
  sdkKeys: Map<string, SdkKey>,
  response: MetricsQueryResponse,
  startTime: Date,
  endTime: Date,
  granularity: Granularity,
  truncated: boolean
): string {
  return `${JSON.stringify(
    {
      flag: flag?.slug ?? null,
      ...(flag
        ? {
            variants: Object.fromEntries(
              flag.variants.map(({ id, value }) => [id, value])
            ),
          }
        : {}),
      groupBy: dimensions,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      granularity,
      truncated,
      buckets: (response.data ?? []).map(row => {
        const bucket: Record<string, unknown> = { timestamp: row.timestamp };
        for (const dimension of dimensions) {
          const value = getCellValue(
            row[FLAG_EVALUATIONS_DIMENSIONS[dimension].field]
          );
          switch (dimension) {
            case 'variant':
              bucket.variantId = value;
              bucket.variantValue = flag
                ? getEvaluationVariantValue(flag, value)
                : null;
              break;
            case 'flag':
              bucket.flagKey = value;
              break;
            case 'sdk-key': {
              const sdkKey = sdkKeys.get(value);
              bucket.sdkKeyId = value;
              bucket.sdkKeyLabel = sdkKey?.label ?? null;
              bucket.sdkKeyEnvironment = sdkKey?.environment ?? null;
              break;
            }
            case 'client':
              bucket.clientName = value;
              break;
            case 'environment':
              bucket.environment = value;
              break;
            case 'reason':
              bucket.reason = value;
              break;
            case 'datafile-revision':
              bucket.datafileRevision = value;
              break;
          }
        }
        bucket.evaluations = row[FLAG_EVALUATIONS_ROLLUP] ?? null;
        return bucket;
      }),
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
    return 2;
  }

  const { args, flags } = parsedArgs;
  const [flagArgument] = args;
  const projectName = getProjectNameFromFlags(flags);
  const since = flags['--since'];
  const until = flags['--until'];
  const granularity = flags['--granularity'];
  const groupByArguments = flags['--group-by'] ?? [];

  telemetry.trackCliArgumentFlag(flagArgument);
  telemetry.trackCliOptionProject(projectName);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionGranularity(granularity);
  telemetry.trackCliOptionGroupBy(
    groupByArguments.length > 0 ? groupByArguments : undefined
  );
  telemetry.trackCliFlagJson(flags['--json']);

  const jsonOutput = flags['--json'] ?? false;

  if (granularity && !isFlagEvaluationsGranularity(granularity)) {
    return outputError(
      client,
      jsonOutput,
      'INVALID_GRANULARITY',
      `Invalid granularity "${granularity}". Use one of: ${FLAG_EVALUATIONS_GRANULARITIES.join(', ')}.`
    );
  }

  const invalidDimension = groupByArguments.find(
    dimension => !isFlagEvaluationsDimension(dimension)
  );
  if (invalidDimension !== undefined) {
    return outputError(
      client,
      jsonOutput,
      'INVALID_GROUP_BY',
      `Invalid group-by dimension "${invalidDimension}". Use one of: ${FLAG_EVALUATIONS_DIMENSION_NAMES.join(', ')}.`
    );
  }

  const dimensions = Array.from(
    new Set(groupByArguments.filter(isFlagEvaluationsDimension))
  );
  if (dimensions.length === 0) {
    dimensions.push(flagArgument ? 'variant' : 'flag');
  }
  if (!flagArgument && dimensions.includes('variant')) {
    return outputError(
      client,
      jsonOutput,
      'MISSING_FLAG',
      `Grouping by variant needs a flag, because variants belong to one flag. Pass a flag: ${getCommandName('flags evaluations <flag> --group-by variant')}, or group the whole project by another dimension.`
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
    ({ startTime, endTime } = alignTimeRangeToGranularity(
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
  // `/metrics/v1` requires a `teamId`, which personal accounts do not have.
  if (link.org.type !== 'team') {
    return outputError(
      client,
      jsonOutput,
      'MISSING_SCOPE',
      PERSONAL_ACCOUNT_MESSAGE
    );
  }

  client.config.currentTeam = link.org.id;

  const { project, org } = link;
  let flag: Flag | undefined;
  const sdkKeys = new Map<string, SdkKey>();
  try {
    const [resolvedFlag, resolvedSdkKeys] = await Promise.all([
      flagArgument ? getFlag(client, project.id, flagArgument) : undefined,
      dimensions.includes('sdk-key')
        ? getSdkKeys(client, project.id).catch((error: unknown) => {
            output.debug(`Could not load SDK keys: ${String(error)}`);
            if (!jsonOutput) {
              output.warn(
                'Could not load SDK key labels; SDK keys are shown as hashes.'
              );
            }
            return [];
          })
        : [],
    ]);
    flag = resolvedFlag;
    for (const sdkKey of resolvedSdkKeys) {
      sdkKeys.set(sdkKey.hashKey, sdkKey);
    }
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
  const groupByFields = dimensions.map(
    dimension => FLAG_EVALUATIONS_DIMENSIONS[dimension].field
  );
  let response: MetricsQueryResponse;
  try {
    const body = createCanonicalMetricsRequest({
      scope,
      metric: FLAG_EVALUATIONS_METRIC,
      selection: {
        metric: FLAG_EVALUATIONS_METRIC,
        aggregation: FLAG_EVALUATIONS_AGGREGATION,
      },
      startTime,
      endTime,
      granularity: resolvedGranularity.duration,
      groupBy: groupByFields,
      filter: flag ? `flagKey:${JSON.stringify(flag.slug)}` : undefined,
      // Fetch one extra group so output can disclose truncation reliably.
      limit: MAX_GROUPS + 1,
      orderBy: 'value',
      orderDirection: 'desc',
    });

    const canonicalResponse = await client.fetch<CanonicalMetricsQueryResponse>(
      OBSERVABILITY_METRICS_PATH,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        accountId: org.id,
        bailOn429: true,
      }
    );
    response = canonicalResponseToMetricsResponse(
      canonicalResponse,
      FLAG_EVALUATIONS_ROLLUP,
      'value',
      'desc'
    );
  } catch (error) {
    return handleMetricsQueryError(client, error, jsonOutput);
  } finally {
    if (!jsonOutput) {
      output.stopSpinner();
    }
  }

  const limited = limitEvaluationGroups(response, groupByFields);

  if (jsonOutput) {
    client.stdout.write(
      formatEvaluationsJson(
        flag,
        dimensions,
        sdkKeys,
        limited.response,
        startTime,
        endTime,
        resolvedGranularity.duration,
        limited.truncated
      )
    );
    return 0;
  }

  const headings = dimensions.map(
    dimension => FLAG_EVALUATIONS_DIMENSIONS[dimension].heading
  );
  if (limited.truncated) {
    const subject =
      headings.length === 1 ? headings[0].toLowerCase() : 'groups';
    output.warn(
      `Results are limited to the ${MAX_GROUPS} most evaluated ${subject}.`
    );
  }
  const headingToDimension = new Map<string, FlagEvaluationsDimension>(
    dimensions.map((dimension, index) => [headings[index], dimension])
  );
  client.stdout.write(
    formatText(
      {
        ...limited.response,
        data: limited.response.data?.map(row => ({
          ...row,
          ...Object.fromEntries(
            dimensions.map((dimension, index) => [
              headings[index],
              getCellValue(row[FLAG_EVALUATIONS_DIMENSIONS[dimension].field]),
            ])
          ),
        })),
      },
      {
        metric: FLAG_EVALUATIONS_METRIC,
        metricUnit: 'count',
        aggregation: FLAG_EVALUATIONS_AGGREGATION,
        groupBy: headings,
        scope,
        projectName: project.name,
        teamName: org.slug,
        periodStart: startTime.toISOString(),
        periodEnd: endTime.toISOString(),
        granularity: resolvedGranularity.duration,
        presentation: {
          compact: true,
          formatGroupValue: (field, value) => {
            switch (headingToDimension.get(field)) {
              case 'variant':
                return sanitizeGroupValue(
                  flag ? getVariantDisplayName(flag, value) : value
                );
              case 'sdk-key':
                return sanitizeGroupValue(getSdkKeyDisplayName(sdkKeys, value));
              default:
                return sanitizeGroupValue(value) || '(not set)';
            }
          },
        },
      }
    )
  );

  return 0;
}
