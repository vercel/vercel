import type Client from '../client';
import type { Granularity } from '../../commands/metrics/types';
import { nonEmptyFilter } from './dimensions';
import {
  queryFirewallObservability,
  rowDimension,
  rowValue,
  type CanonicalRow,
} from './observability-query';

export { alignQueryWindow, REQUEST_METRIC } from './observability-query';

/**
 * The rule dimension on `vercel.firewall_action.count`, and the dashboard's
 * exclusion of rows naming neither a rule nor an action. Those rows carry no
 * attribution, and left in they crowd out the rules a top-list is asked for.
 */
export const RULE_ID_DIMENSION = 'wafRuleId';
export const RULE_TRAFFIC_FILTER = `(${nonEmptyFilter(RULE_ID_DIMENSION)}) AND (${nonEmptyFilter('wafAction')})`;

/**
 * Bucket widths the observability API accepts, coarsest last. A window is
 * charted at the finest width that keeps it under `MAX_BUCKETS`, roughly
 * mirroring the dashboard's range presets (1h→1m, 1d→15m, 7d→30m, 14d→1h).
 */
const GRANULARITY_LADDER: Array<[number, Granularity]> = [
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

/**
 * A sparkline is one character per bucket, so the bucket count is a terminal
 * width budget, not a resolution choice: the dashboard's own presets (1d →
 * 15m) are 96 points, which runs a trend column half again past an 80-column
 * terminal. Callers that know the width pass their own budget.
 */
export const DEFAULT_MAX_BUCKETS = 24;

export function pickGranularity(
  spanMs: number,
  maxBuckets: number = DEFAULT_MAX_BUCKETS
): Granularity {
  for (const [stepMs, granularity] of GRANULARITY_LADDER) {
    if (spanMs / stepMs <= maxBuckets) return granularity;
  }
  return { hours: 24 };
}

interface BaseQueryOpts {
  ownerId: string;
  projectId: string;
  /** Defaults to the firewall actions metric. */
  metric?: string;
  /** KQL. */
  filter?: string;
  startTime: Date;
  endTime: Date;
  timeoutMs?: number;
}

export interface TopListRow {
  /** groupBy field → value, in request order. */
  values: Record<string, string>;
  total: number;
}

/**
 * Top-N entities by request count over the window, ordered and capped by the
 * API — the dashboard's top-list panels.
 *
 * Asks for no buckets: a summary covers the window exactly and scans less
 * than a series nothing would read. It agrees with the chart beside it as
 * long as both are given the same bucket-aligned window — see
 * `alignQueryWindow`, which the traffic commands apply once and share.
 */
export async function getTopList(
  client: Client,
  opts: BaseQueryOpts & {
    groupBy: string[];
    top: number;
  }
): Promise<TopListRow[]> {
  const { summary } = await queryFirewallObservability(client, {
    ...opts,
    granularity: undefined,
    limit: Math.min(opts.top, 500),
  });

  const rows: TopListRow[] = summary.map(row => ({
    values: Object.fromEntries(
      opts.groupBy.map(field => [field, rowDimension(row, field)])
    ),
    total: rowValue(row),
  }));
  rows.sort((a, b) => b.total - a.total);
  return rows.slice(0, opts.top);
}

export interface TrafficSeriesGroup {
  /** groupBy field → value; empty when the query had no groupBy. */
  values: Record<string, string>;
  /** The group's values joined, so two groups cannot collide in a map. */
  key: string;
  total: number;
  /** Aligned to the result's shared `axis`; a missing bucket is a zero. */
  series: number[];
}

export interface GroupedTimeseriesResult {
  startTime: string;
  endTime: string;
  granularity: Granularity;
  /** Sorted ISO timestamps, shared by every group so trends line up. */
  axis: string[];
  groups: TrafficSeriesGroup[];
}

/**
 * A filtered timeseries, optionally split by one or more dimensions: per-group
 * totals and per-group series from a single query, which is what lets a
 * breakdown table carry a trend beside each row rather than a bare count.
 *
 * With no `groupBy` this returns one group keyed `''` — the whole filtered
 * window as a single series.
 */
export async function getGroupedTimeseries(
  client: Client,
  opts: BaseQueryOpts & {
    groupBy?: string[];
    granularity?: Granularity;
    /** Max groups returned; the API keeps the largest by request count. */
    limit?: number;
    /** See `approximateSelection` on the query: a real top-N, not a cap. */
    approximateSelection?: boolean;
  }
): Promise<GroupedTimeseriesResult> {
  const spanMs = opts.endTime.getTime() - opts.startTime.getTime();
  const granularity = opts.granularity ?? pickGranularity(spanMs);
  const groupBy = opts.groupBy ?? [];
  const result = await queryFirewallObservability(client, {
    ...opts,
    granularity,
    groupBy,
  });

  const keyOf = (row: CanonicalRow): string =>
    groupBy.map(f => rowDimension(row, f)).join(' · ');

  const groups = new Map<string, TrafficSeriesGroup>();
  const pointsByGroup = new Map<string, Map<string, number>>();
  const axisSet = new Set<string>();
  // The API returns per-group totals of its own for a grouped query. Summing
  // the buckets instead would disagree with them whenever a group's series is
  // truncated, so only fall back to summing when there is no summary.
  const hasSummary = result.summary.length > 0;

  const getOrCreate = (row: CanonicalRow) => {
    const key = keyOf(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        values: Object.fromEntries(
          groupBy.map(field => [field, rowDimension(row, field)])
        ),
        key,
        total: 0,
        series: [],
      };
      groups.set(key, group);
    }
    return group;
  };

  for (const row of result.summary) {
    getOrCreate(row).total = rowValue(row);
  }

  for (const row of result.series) {
    const timestamp = row.timestamp;
    if (!timestamp) continue;
    axisSet.add(timestamp);
    const group = getOrCreate(row);
    let points = pointsByGroup.get(group.key);
    if (!points) {
      points = new Map();
      pointsByGroup.set(group.key, points);
    }
    const value = rowValue(row);
    points.set(timestamp, (points.get(timestamp) ?? 0) + value);
    if (!hasSummary) group.total += value;
  }

  const axis = [...axisSet].sort();
  for (const group of groups.values()) {
    const points = pointsByGroup.get(group.key);
    group.series = axis.map(t => points?.get(t) ?? 0);
  }

  return {
    startTime: result.startTime.toISOString(),
    endTime: result.endTime.toISOString(),
    granularity,
    axis,
    groups: [...groups.values()].sort((a, b) => b.total - a.total),
  };
}
