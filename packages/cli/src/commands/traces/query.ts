import ms from 'ms';
import { z } from 'zod';
import type Client from '../../util/client';
import { validateIntegerRangeWithDefault } from '../../util/command-validation';
import { isAPIError } from '../../util/errors-ts';
import getScope, {
  type ScopeContext,
  scopeFlagPassed,
} from '../../util/get-scope';
import {
  decodeContinuation,
  encodeContinuation,
} from '../../util/observability/continuation';
import type { EventsRequest } from '../../util/observability/events';
import { getCommandName } from '../../util/pkg-name';
import type { TracesTelemetryClient } from '../../util/telemetry/commands/traces';
import { invalidArguments, handleTracingApiError } from './config/errors';
import { resolveConfigScope } from './config/scope';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
export const SPAN_EVENT = 'vercel.span';
const SPAN_SELECT = ['span', 'resource'] as const;
const QUERY_REASON = 'cli/traces-search';
export const SPAN_KINDS = [
  'UNSPECIFIED',
  'INTERNAL',
  'SERVER',
  'CLIENT',
  'PRODUCER',
  'CONSUMER',
];
const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
const timeInputSchema = z.union([isoDateTimeSchema, z.iso.date()]);
const TIME_FORMAT_HINT =
  'Use a duration with units such as 100ms or 30m, an ISO timestamp, or YYYY-MM-DD at midnight UTC.';

export type SpanQueryFlags = Partial<
  Record<
    | '--project'
    | '--environment'
    | '--service'
    | '--name'
    | '--kind'
    | '--status'
    | '--deployment'
    | '--deployment-id'
    | '--request-id'
    | '--trace'
    | '--trace-id'
    | '--span'
    | '--span-id'
    | '--since'
    | '--until'
    | '--query'
    | '--next',
    string
  >
> & { '--limit'?: number; '--json'?: boolean; '--root'?: boolean };

/** Options fixed by a `--next` cursor; combining them with it is an error. */
const CONTINUATION_CONFLICTS = [
  '--project',
  '--environment',
  '--service',
  '--name',
  '--kind',
  '--status',
  '--deployment',
  '--deployment-id',
  '--request-id',
  '--trace',
  '--trace-id',
  '--span',
  '--span-id',
  '--root',
  '--since',
  '--until',
  '--query',
] as const;

export interface SpanQuery {
  scope: { ownerId: string; projectIds?: [string] };
  timeRange: { start: string; end: string };
  filter: string;
  limit: number;
  /** The API cursor to resume from, set when continuing with `--next`. */
  startCursor?: string;
}

async function resolveSpanSearchScope(
  client: Client,
  project: string | undefined
): Promise<SpanQuery['scope'] | { exitCode: number }> {
  if (project !== undefined) {
    const scope = await resolveConfigScope(client, { project });
    return 'exitCode' in scope
      ? scope
      : { ownerId: scope.teamId, projectIds: [scope.projectId] };
  }

  let scope: ScopeContext;
  try {
    scope = await getScope(client, { resolveLocalScope: true });
  } catch (error) {
    return { exitCode: handleTracingApiError(client, error) };
  }
  if (
    scope.isCrossTeamRepo &&
    !scope.localOrgId &&
    !scope.explicitScopeProvided &&
    (!scope.app || scope.user)
  ) {
    return {
      exitCode: invalidArguments(
        client,
        'This repository has projects across multiple teams. Pass `--scope <team>` or run from a linked project directory.'
      ),
    };
  }
  if (scope.team) {
    return { ownerId: scope.team.id };
  }

  return {
    exitCode: invalidArguments(
      client,
      'A team scope is required. Pass `--scope <team>` or run `vercel switch <team>`.'
    ),
  };
}

function parseTime(input: string, now: number): Date | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const duration = ms(value);
    if (duration !== undefined && (duration <= 0 || !/[a-z]/i.test(value))) {
      return null;
    }
    if (duration === undefined && !timeInputSchema.safeParse(value).success) {
      return null;
    }
    const date = new Date(duration === undefined ? value : now - duration);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

function buildFilter(flags: SpanQueryFlags, spanKind: number | undefined) {
  const clauses = ['NOT (service.name:vercel.* AND span.kind:1)'];
  const query = flags['--query'];
  if (typeof query === 'string') {
    clauses.push(`(${query.trim()})`);
  }
  if (spanKind !== undefined) {
    clauses.push(`span.kind:${spanKind}`);
  }
  if (flags['--root']) {
    clauses.push('span.isRoot:1');
  }

  const filters = [
    ['--environment', 'environment'],
    ['--service', 'service.name'],
    ['--name', 'span.name'],
    ['--status', 'span.status.code'],
    ['--deployment', 'deployment.id'],
    ['--deployment-id', 'deployment.id'],
    ['--request-id', 'request.id'],
    ['--trace', 'trace.id'],
    ['--trace-id', 'trace.id'],
    ['--span', 'span.id'],
    ['--span-id', 'span.id'],
  ] as const;

  for (const [flag, dimension] of filters) {
    const rawValue = flags[flag];
    if (typeof rawValue !== 'string') continue;
    const value =
      flag === '--status'
        ? ({ error: 'Error', ok: 'Ok', unset: 'Unset' } as const)[
            rawValue as 'error' | 'ok' | 'unset'
          ]
        : rawValue.trim();
    clauses.push(`${dimension}:${JSON.stringify(value)}`);
  }

  return clauses.join(' AND ');
}

export function trackSpanQueryOptions(
  flags: SpanQueryFlags,
  telemetry: TracesTelemetryClient
): void {
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliOptionEnvironment(flags['--environment']);
  telemetry.trackCliOptionService(flags['--service']);
  telemetry.trackCliOptionName(flags['--name']);
  telemetry.trackCliOptionKind(flags['--kind']);
  telemetry.trackCliOptionStatus(flags['--status']);
  telemetry.trackCliOptionDeployment(flags['--deployment']);
  telemetry.trackCliOptionDeploymentId(flags['--deployment-id']);
  telemetry.trackCliOptionRequestId(flags['--request-id']);
  telemetry.trackCliOptionTrace(flags['--trace']);
  telemetry.trackCliOptionTraceId(flags['--trace-id']);
  telemetry.trackCliOptionSpan(flags['--span']);
  telemetry.trackCliOptionSpanId(flags['--span-id']);
  telemetry.trackCliFlagRoot(flags['--root']);
  telemetry.trackCliOptionSince(flags['--since']);
  telemetry.trackCliOptionUntil(flags['--until']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionQuery(flags['--query']);
  telemetry.trackCliOptionNext(flags['--next']);
}

export async function resolveSpanQuery(
  client: Client,
  flags: SpanQueryFlags,
  telemetry: TracesTelemetryClient
): Promise<SpanQuery | { exitCode: number }> {
  const project = flags['--project'];
  const environment = flags['--environment']?.trim().toLowerCase();
  const status = flags['--status']?.trim().toLowerCase();
  const query = flags['--query'];

  trackSpanQueryOptions(flags, telemetry);

  if (
    environment !== undefined &&
    !['production', 'preview'].includes(environment)
  ) {
    return {
      exitCode: invalidArguments(
        client,
        '`--environment` must be one of: production, preview.'
      ),
    };
  }
  if (status !== undefined && !['error', 'ok', 'unset'].includes(status)) {
    return {
      exitCode: invalidArguments(
        client,
        '`--status` must be one of: error, ok, unset.'
      ),
    };
  }

  for (const flag of [
    '--service',
    '--name',
    '--deployment',
    '--deployment-id',
    '--request-id',
    '--trace',
    '--trace-id',
    '--span',
    '--span-id',
  ] as const) {
    if (flags[flag] !== undefined && flags[flag]?.trim() === '') {
      return {
        exitCode: invalidArguments(client, `\`${flag}\` must not be empty.`),
      };
    }
  }
  if (query !== undefined && query.trim() === '') {
    return {
      exitCode: invalidArguments(client, '`--query` must not be empty.'),
    };
  }
  let spanKind: number | undefined;
  if (flags['--kind'] !== undefined) {
    const value = flags['--kind'].trim().toUpperCase();
    spanKind = /^[0-5]$/.test(value)
      ? Number(value)
      : SPAN_KINDS.indexOf(value.replace(/^SPAN_KIND_/, ''));
    if (spanKind === -1) {
      return {
        exitCode: invalidArguments(
          client,
          '`--kind` must be one of: UNSPECIFIED (0), INTERNAL (1), SERVER (2), CLIENT (3), PRODUCER (4), CONSUMER (5).'
        ),
      };
    }
  }

  const limit = parseSpanLimit(client, flags['--limit']);
  if (typeof limit !== 'number') return limit;

  const now = Date.now();
  const start = parseTime(flags['--since'] ?? '1h', now);
  const end =
    flags['--until'] !== undefined
      ? parseTime(flags['--until'], now)
      : new Date(now);
  if (!start) {
    return {
      exitCode: invalidArguments(
        client,
        `Invalid time format for \`--since\`. ${TIME_FORMAT_HINT}`
      ),
    };
  }
  if (!end) {
    return {
      exitCode: invalidArguments(
        client,
        `Invalid time format for \`--until\`. ${TIME_FORMAT_HINT}`
      ),
    };
  }
  if (start.getTime() >= end.getTime()) {
    return {
      exitCode: invalidArguments(
        client,
        '`--since` must be earlier than `--until`.'
      ),
    };
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    return {
      exitCode: invalidArguments(
        client,
        'The requested time range must not exceed 30 days.'
      ),
    };
  }
  if (now - start.getTime() > MAX_RANGE_MS) {
    return {
      exitCode: invalidArguments(
        client,
        '`--since` must be within the last 30 days.'
      ),
    };
  }

  const scope = await resolveSpanSearchScope(client, project);
  if ('exitCode' in scope) return scope;

  return {
    scope,
    timeRange: { start: start.toISOString(), end: end.toISOString() },
    filter: buildFilter(
      { ...flags, '--environment': environment, '--status': status },
      spanKind
    ),
    limit,
  };
}

function parseSpanLimit(
  client: Client,
  value: number | undefined
): number | { exitCode: number } {
  const limitResult = validateIntegerRangeWithDefault(value, {
    flag: '--limit',
    min: 1,
    max: MAX_LIMIT,
    defaultValue: DEFAULT_LIMIT,
  });
  if (!limitResult.valid) {
    return { exitCode: invalidArguments(client, limitResult.message) };
  }
  return limitResult.value;
}

function isCanonicalTimestamp(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

/**
 * Rebuilds a search from a `--next` token. The token holds the team, project,
 * filter, and time window the API bound its cursor to, so the filter flags and
 * `--since`/`--until` can't be combined with it. `--limit` can change.
 */
export function resolveSpanContinuation(
  client: Client,
  flags: SpanQueryFlags,
  telemetry: TracesTelemetryClient
): SpanQuery | { exitCode: number } {
  trackSpanQueryOptions(flags, telemetry);

  const token = flags['--next']?.trim();
  if (!token) {
    return {
      exitCode: invalidArguments(client, '`--next` must not be empty.'),
    };
  }
  const continuation = decodeContinuation(token);
  const projectIds = continuation?.projectIds ?? [];
  if (
    !continuation ||
    continuation.event !== SPAN_EVENT ||
    continuation.order !== 'desc' ||
    projectIds.length > 1 ||
    !isCanonicalTimestamp(continuation.timeRange.start) ||
    !isCanonicalTimestamp(continuation.timeRange.end) ||
    continuation.timeRange.start >= continuation.timeRange.end
  ) {
    return {
      exitCode: invalidArguments(
        client,
        `\`--next\` is not a valid cursor. Use the pagination.next value from the summary of a previous ${getCommandName(
          'traces search --json'
        )} run.`
      ),
    };
  }
  for (const flag of CONTINUATION_CONFLICTS) {
    if (flags[flag] !== undefined) {
      return {
        exitCode: invalidArguments(
          client,
          `\`${flag}\` can't be combined with \`--next\`. The cursor keeps the original filters and time window.`
        ),
      };
    }
  }
  // Without an explicit team flag, the cursor supplies the team. An explicit
  // one must agree with it; the entry point already resolved it.
  if (
    scopeFlagPassed(client.argv) &&
    client.config.currentTeam !== continuation.ownerId
  ) {
    return {
      exitCode: invalidArguments(
        client,
        'The `--next` cursor belongs to a different team than `--scope`. Remove `--scope` to use the team in the cursor.'
      ),
    };
  }

  const limit = parseSpanLimit(client, flags['--limit']);
  if (typeof limit !== 'number') return limit;

  return {
    scope: {
      ownerId: continuation.ownerId,
      ...(projectIds.length === 1 ? { projectIds: [projectIds[0]] } : {}),
    },
    timeRange: continuation.timeRange,
    filter: continuation.filter ?? '',
    limit,
    startCursor: continuation.cursor,
  };
}

/** The events API request for a search. */
export function spanEventsRequest(query: SpanQuery): EventsRequest {
  return {
    event: SPAN_EVENT,
    ownerId: query.scope.ownerId,
    ...(query.scope.projectIds ? { projectIds: query.scope.projectIds } : {}),
    timeRange: query.timeRange,
    ...(query.filter ? { filter: query.filter } : {}),
    select: SPAN_SELECT,
    queryReason: QUERY_REASON,
    bailOn429: true,
  };
}

/** Encodes a `--next` token that continues `query` from an API cursor. */
export function spanContinuationToken(
  query: SpanQuery,
  cursor: string
): string {
  return encodeContinuation({
    event: SPAN_EVENT,
    ownerId: query.scope.ownerId,
    ...(query.scope.projectIds ? { projectIds: query.scope.projectIds } : {}),
    timeRange: query.timeRange,
    ...(query.filter ? { filter: query.filter } : {}),
    order: 'desc',
    cursor,
  });
}

export function handleSpanQueryError(client: Client, err: unknown): number {
  addSpanQueryIssueDetails(err);
  return handleTracingApiError(client, err);
}

/** Appends the API's validation issues to an events API error's message. */
export function addSpanQueryIssueDetails(err: unknown): void {
  if (isAPIError(err)) {
    const issues = z
      .array(z.object({ path: z.string(), message: z.string() }))
      .safeParse(err.issues);
    if (issues.success && issues.data.length > 0) {
      const details = issues.data
        .map(issue => `${issue.path}: ${issue.message}`)
        .join(', ');
      err.serverMessage = `${err.serverMessage}: ${details}`;
      if (
        (err.status === 400 || err.status === 422) &&
        issues.data.some(issue => issue.path === 'filter')
      ) {
        err.serverMessage +=
          '. Filter error positions refer to the generated filter, including CLI-added clauses.';
      }
      err.message = `${err.serverMessage} (${err.status})`;
    }
  }
}
