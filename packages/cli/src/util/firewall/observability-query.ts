import type Client from '../client';
import { isAPIError } from '../errors-ts';
import { OBSERVABILITY_METRICS_PATH } from '../../commands/metrics/schema-api';
import type {
  CanonicalMetricsQueryRequest,
  CanonicalMetricsQueryResponse,
  Granularity,
} from '../../commands/metrics/types';

/**
 * Requests actioned by the firewall, one row per request. Its only
 * aggregations are `count` and `unique`: it is a count metric, and asking it
 * to `sum` is rejected rather than answered.
 */
export const FIREWALL_ACTION_METRIC = 'vercel.firewall_action.count';

/**
 * Request counts, the public equivalent of the dashboard's `incomingRequest`
 * event. Unknown-bot categories and `botVerified` are reported here and not
 * on `firewall_action`, and the two metrics share no schema, so a query moved
 * onto this one must not carry a filter naming `wafRuleId` or `wafAction`.
 */
export const REQUEST_METRIC = 'vercel.request.count';

/** The single metric alias every firewall query asks for. */
const VALUE_ALIAS = 'value';

/** Cold ClickHouse queries can be slow; fail instead of hanging forever. */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * A query that ran out of time, from either side: the observability API
 * answers 408, and the client gives up first on a slow enough one. Named so a
 * caller can tell it apart from a genuine failure without matching messages.
 */
export class ActivityTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityTimeoutError';
  }
}

/** The observability API refused the query for querying too often. */
export function isRateLimited(error: unknown): boolean {
  return isAPIError(error) && error.status === 429;
}

/**
 * How long the API asked us to wait, in seconds, when it said so usefully.
 * `Retry-After: 0` and a missing header both read as "it did not say".
 */
export function rateLimitRetrySeconds(error: unknown): number | undefined {
  if (!isRateLimited(error)) return undefined;
  const ms = (error as { retryAfterMs?: number | 'never' }).retryAfterMs;
  if (typeof ms !== 'number' || ms <= 0) return undefined;
  return Math.ceil(ms / 1000);
}

export function isActivityTimeout(error: unknown): boolean {
  return (
    (isAPIError(error) && error.status === 408) ||
    (error instanceof Error && error.name === 'ActivityTimeoutError')
  );
}

export function toBucketSeconds(granularity: Granularity): number {
  if ('minutes' in granularity) return granularity.minutes * 60;
  if ('hours' in granularity) return granularity.hours * 60 * 60;
  return granularity.days * 24 * 60 * 60;
}

/**
 * Round a window out to the grid the query will actually run on: whole
 * buckets when it asks for a series, whole seconds when it does not.
 *
 * Both roundings are the API's. Whole seconds because
 * `vercel.firewall_action` is stored with `DateTime` timestamps and a range
 * carrying any sub-second component is rejected outright — which a window
 * taken from `new Date()` always does. Whole buckets because a request
 * carrying `bucketSeconds` has its range floored and ceiled to them
 * server-side (`alignMetricsTimeRangeToBuckets` in the observability API), so
 * a bucketed query covers the bucket grid around the window whether or not we
 * ask it to.
 *
 * Doing that second rounding here rather than leaving it to the API is what
 * keeps the parts of a report describing one window. A bucketed series and
 * the unbucketed top lists beside it are separate queries: sending each the
 * window as asked for had the series run over the bucket grid around it — 25
 * hourly buckets for a day beginning at 10:30, half an hour of it outside the
 * window — while the top lists ran over exactly the day, so their totals
 * could not add up to the chart's. A window already on the grid makes the
 * API's rounding a no-op for the series and gives the top lists the same
 * range, and it is also the window this returns, so the header and `--json`
 * report the span the numbers came from.
 *
 * Idempotent, so a caller that aligned its own window up front (as the
 * traffic commands do, to share one window across every panel) is not
 * rounded again here.
 */
export function alignQueryWindow(
  startTime: Date,
  endTime: Date,
  granularity?: Granularity
): { startTime: Date; endTime: Date } {
  const stepMs = granularity ? toBucketSeconds(granularity) * 1000 : 1000;
  return {
    startTime: new Date(Math.floor(startTime.getTime() / stepMs) * stepMs),
    endTime: new Date(Math.ceil(endTime.getTime() / stepMs) * stepMs),
  };
}

/** A summary or series row, with the value under the one alias we ask for. */
export interface CanonicalRow {
  dimensions: Record<string, string | null>;
  values: Record<string, number | null>;
}

export interface FirewallQueryResult {
  summary: CanonicalRow[];
  series: Array<CanonicalRow & { timestamp: string }>;
  /** The window actually queried, after bucket alignment. */
  startTime: Date;
  endTime: Date;
}

export interface FirewallQueryOptions {
  ownerId: string;
  projectId: string;
  /** Defaults to the firewall actions metric. */
  metric?: string;
  /** KQL. */
  filter?: string;
  startTime: Date;
  endTime: Date;
  /**
   * Bucket width for a timeseries. Omitted asks for a summary alone, which is
   * the cheaper way to read a total — and covers the window exactly, where a
   * bucketed query covers the whole buckets around it. Pass a window already
   * on the bucket grid (`alignQueryWindow`) when a summary and a series have
   * to agree.
   */
  granularity?: Granularity;
  groupBy?: string[];
  /** Groups to keep, by descending value. Meaningless without a `groupBy`. */
  limit?: number;
  /**
   * Whether `limit` is a genuine top-N over an open-ended dimension, rather
   * than a cap comfortably above the whole group set. Only the former can be
   * served from a sampled read, and only the former loses nothing by being
   * approximate. Meaningless without `limit` and a bucketed query.
   */
  approximateSelection?: boolean;
  timeoutMs?: number;
  /** Names the operation in a timeout message, e.g. "firewall traffic data". */
  timeoutSubject?: string;
}

/**
 * Read `vercel.firewall_action.count` (or another metric) from the
 * Observability API — the ClickHouse query engine `vercel metrics` reads,
 * reached at `/metrics/v1`.
 *
 * The API answers a bucketed query with a series *and* per-group summary
 * totals, so a breakdown gets its trends and its totals from one round trip.
 * An unbucketed query is the cheaper way to ask for a top list: it covers the
 * window exactly and orders and caps the rows server-side.
 */
export async function queryFirewallObservability(
  client: Client,
  opts: FirewallQueryOptions
): Promise<FirewallQueryResult> {
  const groupBy = opts.groupBy ?? [];
  const window = alignQueryWindow(
    opts.startTime,
    opts.endTime,
    opts.granularity
  );
  const bucketed = opts.granularity !== undefined;
  const ranked = groupBy.length > 0 && opts.limit !== undefined;

  const body: CanonicalMetricsQueryRequest = {
    scope: {
      ownerId: opts.ownerId,
      projectIds: [opts.projectId],
    },
    timeRange: {
      start: window.startTime.toISOString(),
      end: window.endTime.toISOString(),
    },
    metrics: {
      [VALUE_ALIAS]: {
        metric: opts.metric ?? FIREWALL_ACTION_METRIC,
        aggregation: 'count',
      },
    },
    outputs: [VALUE_ALIAS],
    ...(opts.granularity
      ? { bucketSeconds: toBucketSeconds(opts.granularity) }
      : {}),
    ...(groupBy.length > 0 ? { groupBy } : {}),
    ...(opts.filter ? { filter: opts.filter } : {}),
    // A bucketed result is complete or it fails, so a grouped one narrows
    // through `seriesSelection`; `orderBy` and `rowLimit` are for the
    // unbucketed summary and rejected next to `bucketSeconds`.
    ...(ranked && bucketed
      ? {
          seriesSelection: {
            limit: opts.limit!,
            mode: opts.approximateSelection
              ? ('approximate' as const)
              : ('exact' as const),
            rankBy: [{ metric: VALUE_ALIAS, direction: 'desc' as const }],
          },
        }
      : {}),
    ...(ranked && !bucketed
      ? {
          rowLimit: opts.limit!,
          orderBy: [{ metric: VALUE_ALIAS, direction: 'desc' as const }],
        }
      : {}),
  };

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let response: CanonicalMetricsQueryResponse;
  try {
    response = await client.fetch<CanonicalMetricsQueryResponse>(
      OBSERVABILITY_METRICS_PATH,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        accountId: opts.ownerId,
        signal: AbortSignal.timeout(timeoutMs),
        // Surface the rate limit instead of waiting it out. The client
        // otherwise sleeps `Retry-After` plus up to 30s of random skew and
        // retries, silently and usually past this request's own deadline —
        // which is how a rate-limited report reads as a hung command.
        bailOn429: true,
      }
    );
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    ) {
      throw new ActivityTimeoutError(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${
          opts.timeoutSubject ?? 'firewall traffic data'
        }.`
      );
    }
    throw err;
  }

  return {
    summary: response.summary ?? [],
    series: response.series ?? [],
    startTime: window.startTime,
    endTime: window.endTime,
  };
}

/** The one alias every firewall query reads its value from. */
export function rowValue(row: CanonicalRow): number {
  const raw = row.values?.[VALUE_ALIAS];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function rowDimension(row: CanonicalRow, field: string): string {
  return String(row.dimensions?.[field] ?? '');
}

/**
 * Whether the API rejected the query for naming a dimension the metric does
 * not have, which is it telling us this panel and this filter cannot be
 * combined. Read from the response rather than guessed at from the flags, so
 * it stays right as either metric's schema changes.
 *
 * A validation failure carries a generic message and puts the reason in
 * `issues`, so both have to be checked.
 */
export function isUnsupportedDimension(error: unknown): boolean {
  if (!isAPIError(error) || error.status !== 400) return false;
  const pattern = /does not support|is not supported|not publicly queryable/i;
  const issues = (error as { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    return issues.some(
      issue => typeof issue?.message === 'string' && pattern.test(issue.message)
    );
  }
  return pattern.test(error.serverMessage || error.message || '');
}
