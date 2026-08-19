import type Client from '../client';
import { getRollupColumnName } from '../../commands/metrics/output';
import type {
  Granularity,
  MetricsQueryRequest,
  MetricsQueryResponse,
} from '../../commands/metrics/types';

export const FIREWALL_ACTION_METRIC = 'vercel.firewall_action.count';
/** Public equivalent of the dashboard's `incomingRequest` event. */
export const REQUEST_METRIC = 'vercel.request.count';

/** Cold ClickHouse queries can be slow; fail instead of hanging forever. */
const QUERY_TIMEOUT_MS = 45_000;

const GRANULARITY_LADDER_MS: Array<[number, Granularity]> = [
  [60_000, { minutes: 1 }],
  [5 * 60_000, { minutes: 5 }],
  [15 * 60_000, { minutes: 15 }],
  [30 * 60_000, { minutes: 30 }],
  [3_600_000, { hours: 1 }],
  [2 * 3_600_000, { hours: 2 }],
  [4 * 3_600_000, { hours: 4 }],
  [12 * 3_600_000, { hours: 12 }],
  [24 * 3_600_000, { hours: 24 }],
];

const MAX_BUCKETS = 200;

/**
 * Smallest granularity that keeps the window under ~200 buckets, roughly
 * mirroring the dashboard's range presets (1h→1m, 1d→15m, 7d→30m, 14d→1h).
 */
export function pickGranularity(spanMs: number): Granularity {
  for (const [stepMs, granularity] of GRANULARITY_LADDER_MS) {
    if (spanMs / stepMs <= MAX_BUCKETS) return granularity;
  }
  return { hours: 24 };
}

export function granularityMs(granularity: Granularity): number {
  if ('minutes' in granularity) return granularity.minutes * 60_000;
  if ('hours' in granularity) return granularity.hours * 3_600_000;
  return granularity.days * 86_400_000;
}

export function granularityLabel(granularity: Granularity): string {
  if ('minutes' in granularity) return `${granularity.minutes}m`;
  if ('hours' in granularity) return `${granularity.hours}h`;
  return `${granularity.days}d`;
}

interface BaseQueryOpts {
  ownerId: string;
  projectId: string;
  /** Defaults to the firewall actions metric. */
  metric?: string;
  filter?: string;
  startTime: Date;
  endTime: Date;
  timeoutMs?: number;
}

async function queryObservability(
  client: Client,
  opts: BaseQueryOpts & {
    groupBy?: string[];
    granularity: Granularity;
    limit?: number;
    orderByValue?: boolean;
  }
): Promise<{ response: MetricsQueryResponse; rollupColumn: string }> {
  const metric = opts.metric ?? FIREWALL_ACTION_METRIC;
  const rollupColumn = getRollupColumnName(metric, 'sum');

  const body: MetricsQueryRequest = {
    scope: {
      type: 'project',
      ownerId: opts.ownerId,
      projectIds: [opts.projectId],
    },
    metric,
    aggregation: 'sum',
    startTime: opts.startTime.toISOString(),
    endTime: opts.endTime.toISOString(),
    granularity: opts.granularity,
    groupBy: opts.groupBy,
    filter: opts.filter,
    limit: opts.limit,
    orderBy: opts.orderByValue ? rollupColumn : undefined,
    orderDirection: opts.orderByValue ? 'desc' : undefined,
  };

  const timeoutMs = opts.timeoutMs ?? QUERY_TIMEOUT_MS;
  try {
    const response = await client.fetch<MetricsQueryResponse>(
      '/v2/observability/query',
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        accountId: opts.ownerId,
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    return { response, rollupColumn };
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    ) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for firewall traffic data. Re-run the command — the next try is usually faster.`
      );
    }
    throw err;
  }
}

function numericValue(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export interface TopListRow {
  /** groupBy field → value, in request order. */
  values: Record<string, string>;
  total: number;
}

/**
 * Top-N entities by request count over the window (summary rows only),
 * mirroring the dashboard's top-list panels (`orderBy: 'value'`, limit ≤ 500).
 */
export async function getTopList(
  client: Client,
  opts: BaseQueryOpts & { groupBy: string[]; top: number }
): Promise<TopListRow[]> {
  const spanMs = opts.endTime.getTime() - opts.startTime.getTime();
  const { response, rollupColumn } = await queryObservability(client, {
    ...opts,
    // Single bucket: we only need the summary, not a timeseries.
    granularity: { hours: Math.max(1, Math.ceil(spanMs / 3_600_000)) },
    limit: Math.min(opts.top, 500),
    orderByValue: true,
  });

  const rows: TopListRow[] = [];
  for (const row of response.summary ?? []) {
    const record = row as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const field of opts.groupBy) {
      values[field] = String(record[field] ?? '');
    }
    rows.push({ values, total: numericValue(record[rollupColumn]) });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows.slice(0, opts.top);
}

export interface TrafficSeriesGroup {
  /** groupBy field → value; empty when the query had no groupBy. */
  values: Record<string, string>;
  key: string;
  total: number;
  /** Aligned to the shared `axis`; missing buckets are true zeros. */
  series: number[];
}

export interface GroupedTimeseriesResult {
  startTime: string;
  endTime: string;
  granularity: Granularity;
  /** Shared sorted ISO-timestamp axis across all groups. */
  axis: string[];
  groups: TrafficSeriesGroup[];
}

/**
 * Filtered timeseries, optionally grouped (per-group series + totals from one
 * query). With no groupBy this returns a single group keyed `''`.
 */
export async function getGroupedTimeseries(
  client: Client,
  opts: BaseQueryOpts & {
    groupBy?: string[];
    granularity?: Granularity;
    /** Max groups (dashboard uses 10 for charts). */
    limit?: number;
  }
): Promise<GroupedTimeseriesResult> {
  const spanMs = opts.endTime.getTime() - opts.startTime.getTime();
  const granularity = opts.granularity ?? pickGranularity(spanMs);
  const groupBy = opts.groupBy ?? [];
  const { response, rollupColumn } = await queryObservability(client, {
    ...opts,
    granularity,
    groupBy,
    limit: opts.limit,
    orderByValue: groupBy.length > 0,
  });

  const keyOf = (record: Record<string, unknown>): string =>
    groupBy.map(f => String(record[f] ?? '')).join(' · ');

  const groups = new Map<string, TrafficSeriesGroup>();
  const axisSet = new Set<string>();
  const hasSummary = Boolean(response.summary && response.summary.length > 0);

  const getOrCreate = (record: Record<string, unknown>) => {
    const key = keyOf(record);
    let group = groups.get(key);
    if (!group) {
      const values: Record<string, string> = {};
      for (const field of groupBy) {
        values[field] = String(record[field] ?? '');
      }
      group = { values, key, total: 0, series: [] };
      groups.set(key, group);
    }
    return group;
  };

  for (const row of response.summary ?? []) {
    const record = row as Record<string, unknown>;
    getOrCreate(record).total = numericValue(record[rollupColumn]);
  }

  const pointsByGroup = new Map<string, Map<string, number>>();
  for (const row of response.data ?? []) {
    const record = row as Record<string, unknown>;
    const timestamp = String(record.timestamp ?? '');
    if (!timestamp) continue;
    axisSet.add(timestamp);
    const group = getOrCreate(record);
    let points = pointsByGroup.get(group.key);
    if (!points) {
      points = new Map();
      pointsByGroup.set(group.key, points);
    }
    const value = numericValue(record[rollupColumn]);
    points.set(timestamp, (points.get(timestamp) ?? 0) + value);
    if (!hasSummary) group.total += value;
  }

  const axis = [...axisSet].sort();
  for (const group of groups.values()) {
    const points = pointsByGroup.get(group.key);
    group.series = axis.map(t => points?.get(t) ?? 0);
  }

  const sorted = [...groups.values()].sort((a, b) => b.total - a.total);

  return {
    startTime: opts.startTime.toISOString(),
    endTime: opts.endTime.toISOString(),
    granularity,
    axis,
    groups: sorted,
  };
}
