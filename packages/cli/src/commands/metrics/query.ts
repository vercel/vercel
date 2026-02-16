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
import {
  formatCsv,
  formatQueryJson,
  formatErrorJson,
  getRollupColumnName,
} from './output';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import type { Scope } from './types';
import { getLinkedProject } from '../../util/projects/link';
import getScope from '../../util/get-scope';

const RELATIVE_TIME_RE = /^(\d+)(m|h|d|w)$/;

const UNIT_TO_MS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function parseTimeFlag(input: string): Date {
  const match = RELATIVE_TIME_RE.exec(input);
  if (match) {
    const [, amount, unit] = match;
    const ms = parseInt(amount, 10) * UNIT_TO_MS[unit];
    return new Date(Date.now() - ms);
  }
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid time format "${input}". Use relative (1h, 30m, 2d, 1w) or ISO 8601 datetime.`
    );
  }
  return date;
}

export function resolveTimeRange(
  since?: string,
  until?: string
): { startTime: Date; endTime: Date } {
  const startTime = parseTimeFlag(since ?? '1h');
  const endTime = until ? parseTimeFlag(until) : new Date();
  return { startTime, endTime };
}

export function toGranularityDuration(input: string): Record<string, number> {
  const match = RELATIVE_TIME_RE.exec(input);
  if (!match) {
    throw new Error(
      `Invalid granularity format "${input}". Use 1m, 5m, 15m, 1h, 4h, 1d.`
    );
  }
  const [, amount, unit] = match;
  const num = parseInt(amount, 10);
  switch (unit) {
    case 'm':
      return { minutes: num };
    case 'h':
      return { hours: num };
    case 'd':
      return { days: num };
    case 'w':
      return { days: num * 7 };
    default:
      throw new Error(`Unknown time unit "${unit}".`);
  }
}

export function toGranularityMs(input: string): number {
  const match = RELATIVE_TIME_RE.exec(input);
  if (!match) {
    throw new Error(`Invalid granularity format "${input}".`);
  }
  const [, amount, unit] = match;
  return parseInt(amount, 10) * UNIT_TO_MS[unit];
}

interface GranularityResult {
  duration: Record<string, number>;
  adjusted: boolean;
  notice?: string;
}

// Auto-granularity thresholds: [maxRangeMs, defaultGranularity, minGranularity]
const GRANULARITY_THRESHOLDS: [number, string, string][] = [
  [1 * 60 * 60 * 1000, '1m', '1m'], // ≤1h
  [2 * 60 * 60 * 1000, '5m', '5m'], // ≤2h
  [12 * 60 * 60 * 1000, '15m', '5m'], // ≤12h
  [3 * 24 * 60 * 60 * 1000, '1h', '1h'], // ≤3d
  [30 * 24 * 60 * 60 * 1000, '4h', '4h'], // ≤30d
];
const FALLBACK_GRANULARITY = '1d';

function getAutoGranularity(rangeMs: number): string {
  for (const [maxRange, defaultG] of GRANULARITY_THRESHOLDS) {
    if (rangeMs <= maxRange) {
      return defaultG;
    }
  }
  return FALLBACK_GRANULARITY;
}

function getMinGranularity(rangeMs: number): string {
  for (const [maxRange, , minG] of GRANULARITY_THRESHOLDS) {
    if (rangeMs <= maxRange) {
      return minG;
    }
  }
  return FALLBACK_GRANULARITY;
}

export function computeGranularity(
  rangeMs: number,
  explicit?: string
): GranularityResult {
  if (!explicit) {
    const auto = getAutoGranularity(rangeMs);
    return {
      duration: toGranularityDuration(auto),
      adjusted: false,
    };
  }

  const minG = getMinGranularity(rangeMs);
  const explicitMs = toGranularityMs(explicit);
  const minMs = toGranularityMs(minG);

  if (explicitMs < minMs) {
    const rangeDays = Math.round(rangeMs / (24 * 60 * 60 * 1000));
    const rangeHours = Math.round(rangeMs / (60 * 60 * 1000));
    const rangeLabel =
      rangeDays >= 1 ? `${rangeDays}-day` : `${rangeHours}-hour`;
    return {
      duration: toGranularityDuration(minG),
      adjusted: true,
      notice: `Granularity adjusted from ${explicit} to ${minG} for a ${rangeLabel} time range.`,
    };
  }

  return {
    duration: toGranularityDuration(explicit),
    adjusted: false,
  };
}

export function roundTimeBoundaries(
  start: Date,
  end: Date,
  granularityMs: number
): { start: Date; end: Date } {
  const flooredStart = new Date(
    Math.floor(start.getTime() / granularityMs) * granularityMs
  );
  const ceiledEnd = new Date(
    Math.ceil(end.getTime() / granularityMs) * granularityMs
  );
  return { start: flooredStart, end: ceiledEnd };
}

function handleValidationError(
  result: {
    valid: false;
    code: string;
    message: string;
    allowedValues?: string[];
  },
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
  status: number,
  err: any,
  jsonOutput: boolean,
  client: Client
): number {
  let code: string;
  let message: string;

  switch (status) {
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
      code = err?.code || 'BAD_REQUEST';
      message = err?.serverMessage || `API error (${status})`;
  }

  if (jsonOutput) {
    client.stdout.write(formatErrorJson(code, message));
  } else {
    output.error(message);
  }
  return 1;
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

  // Track telemetry
  const event = flags['--event'] as string | undefined;
  const measure = (flags['--measure'] as string | undefined) ?? 'count';
  const aggregation = (flags['--aggregation'] as string | undefined) ?? 'sum';
  const groupBy = (flags['--group-by'] as string[] | undefined) ?? [];
  const limit = flags['--limit'] as number | undefined;
  const orderBy = flags['--order-by'] as string | undefined;
  const filter = flags['--filter'] as string | undefined;
  const since = flags['--since'] as string | undefined;
  const until = flags['--until'] as string | undefined;
  const granularity = flags['--granularity'] as string | undefined;
  const project = flags['--project'] as string | undefined;
  const all = flags['--all'] as boolean | undefined;

  telemetry.trackCliOptionEvent(event);
  telemetry.trackCliOptionMeasure(flags['--measure'] as string | undefined);
  telemetry.trackCliOptionAggregation(
    flags['--aggregation'] as string | undefined
  );
  telemetry.trackCliOptionGroupBy(groupBy.length > 0 ? groupBy : undefined);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliOptionOrderBy(orderBy);
  telemetry.trackCliOptionFilter(filter);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionGranularity(granularity);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionFormat(flags['--format'] as string | undefined);

  // Validate --event (required)
  const requiredResult = validateRequiredEvent(event);
  if (!requiredResult.valid) {
    return handleValidationError(requiredResult, jsonOutput, client);
  }

  // Validate event name
  const eventResult = validateEvent(event!);
  if (!eventResult.valid) {
    return handleValidationError(eventResult, jsonOutput, client);
  }

  // Validate measure
  const measureResult = validateMeasure(event!, measure);
  if (!measureResult.valid) {
    return handleValidationError(measureResult, jsonOutput, client);
  }

  // Validate aggregation
  const aggResult = validateAggregation(event!, measure, aggregation);
  if (!aggResult.valid) {
    return handleValidationError(aggResult, jsonOutput, client);
  }

  // Validate group-by dimensions
  const groupByResult = validateGroupBy(event!, groupBy);
  if (!groupByResult.valid) {
    return handleValidationError(groupByResult, jsonOutput, client);
  }

  // Validate mutual exclusivity
  const mutualResult = validateMutualExclusivity(all, project);
  if (!mutualResult.valid) {
    return handleValidationError(mutualResult, jsonOutput, client);
  }

  // Resolve scope
  let scope: Scope;
  let accountId: string | undefined;

  if (!project && !all) {
    // Default: linked project
    const linkedProject = await getLinkedProject(client);
    if (linkedProject.status === 'error') {
      return linkedProject.exitCode;
    }
    if (linkedProject.status === 'not_linked') {
      const errMsg =
        'No linked project found. Run `vercel link` to link a project, or use --project <name> or --all.';
      if (jsonOutput) {
        client.stdout.write(formatErrorJson('NOT_LINKED', errMsg));
      } else {
        output.error(errMsg);
      }
      return 1;
    }
    scope = {
      type: 'project-with-slug',
      teamSlug: linkedProject.org.slug,
      projectName: linkedProject.project.name,
    };
    accountId = linkedProject.org.id;
  } else {
    // --project or --all: need team context
    const { team } = await getScope(client);
    if (!team) {
      const errMsg =
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.';
      if (jsonOutput) {
        client.stdout.write(formatErrorJson('NO_TEAM', errMsg));
      } else {
        output.error(errMsg);
      }
      return 1;
    }
    if (all) {
      scope = { type: 'team-with-slug', teamSlug: team.slug };
    } else {
      scope = {
        type: 'project-with-slug',
        teamSlug: team.slug,
        projectName: project!,
      };
    }
    accountId = team.id;
  }

  // Resolve time range
  let startTime: Date;
  let endTime: Date;
  try {
    ({ startTime, endTime } = resolveTimeRange(since, until));
  } catch (err) {
    const errMsg = (err as Error).message;
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
    event: event!,
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
  let response;
  try {
    response = await client.fetch(metricsUrl, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      accountId,
    });
  } catch (err: any) {
    output.stopSpinner();
    if (err.status) {
      return handleApiError(err.status, err, jsonOutput, client);
    }
    const errMsg = (err as Error).message;
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
          event: event!,
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

function toGranularityMsFromDuration(duration: Record<string, number>): number {
  let ms = 0;
  if (duration.minutes) {
    ms += duration.minutes * 60 * 1000;
  }
  if (duration.hours) {
    ms += duration.hours * 60 * 60 * 1000;
  }
  if (duration.days) {
    ms += duration.days * 24 * 60 * 60 * 1000;
  }
  return ms;
}
