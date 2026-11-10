import type Client from '../client';
import type { Granularity } from '../../commands/metrics/types';
import {
  queryFirewallObservability,
  rowDimension,
  rowValue,
  type CanonicalRow,
} from './observability-query';

export {
  ActivityTimeoutError,
  FIREWALL_ACTION_METRIC,
  isActivityTimeout,
} from './observability-query';

/** The action dimension on `vercel.firewall_action.count`. */
const ACTION_DIMENSION = 'wafAction';

export type FirewallActionName =
  | 'allow'
  | 'deny'
  | 'challenge'
  | 'log'
  | 'rate_limit'
  | 'bypass'
  | string;

export interface FirewallActionPoint {
  timestamp: string;
  value: number;
}

export interface FirewallActionSeries {
  action: FirewallActionName;
  total: number;
  timeseries: FirewallActionPoint[];
}

export interface FirewallMetricsResult {
  startTime: string;
  endTime: string;
  granularity: Granularity;
  series: FirewallActionSeries[];
  totals: Record<string, number>;
}

/**
 * Not every row of the metric names an action: requests the firewall let
 * through without a rule matching carry an empty `wafAction`. Left as `''`
 * they render as a blank-labelled row, so name them instead.
 */
function actionFromRow(row: CanonicalRow): string {
  return rowDimension(row, ACTION_DIMENSION) || 'unknown';
}

/**
 * Fetch Requests-by-Action totals + timeseries over the given window, via the
 * Observability API used by `vercel metrics`.
 *
 * The window is the caller's, not ours: every panel of the activity block has
 * to cover the same period, and a window derived here would be one the other
 * queries could only learn by waiting for this one to answer. It comes back
 * rounded out to whole buckets, which is the span the numbers describe.
 */
export default async function getFirewallMetrics(
  client: Client,
  opts: {
    projectId: string;
    ownerId: string;
    startTime: Date;
    endTime: Date;
    granularity?: Granularity;
    /** KQL. */
    filter?: string;
    timeoutMs?: number;
  }
): Promise<FirewallMetricsResult> {
  const granularity = opts.granularity ?? ({ hours: 1 } as const);

  const result = await queryFirewallObservability(client, {
    ownerId: opts.ownerId,
    projectId: opts.projectId,
    startTime: opts.startTime,
    endTime: opts.endTime,
    granularity,
    groupBy: [ACTION_DIMENSION],
    filter: opts.filter,
    // Caps series, not points, so this is well clear of the handful of
    // actions a firewall can report.
    limit: 100,
    timeoutMs: opts.timeoutMs,
    timeoutSubject: 'firewall metrics',
  });

  const byAction = new Map<string, FirewallActionSeries>();
  // Which actions `summary` gave a total for, tracked per action rather than
  // for the response as a whole. An action can appear in the series alone, and
  // its total then has to come from accumulating those rows; deciding that
  // once for every action reports 0 for such a series alongside a non-empty
  // timeseries.
  const totalFromSummary = new Set<string>();

  for (const row of result.summary) {
    const action = actionFromRow(row);
    totalFromSummary.add(action);
    byAction.set(action, { action, total: rowValue(row), timeseries: [] });
  }

  for (const row of result.series) {
    const action = actionFromRow(row);
    const value = rowValue(row);
    let series = byAction.get(action);
    if (!series) {
      series = { action, total: 0, timeseries: [] };
      byAction.set(action, series);
    }
    series.timeseries.push({ timestamp: row.timestamp, value });
    if (!totalFromSummary.has(action)) {
      series.total += value;
    }
  }

  const order = ['allow', 'deny', 'challenge', 'log', 'rate_limit', 'bypass'];
  const series = [...byAction.values()].sort((a, b) => {
    const ai = order.indexOf(a.action);
    const bi = order.indexOf(b.action);
    if (ai === -1 && bi === -1) return a.action.localeCompare(b.action);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  for (const s of series) {
    s.timeseries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  const totals: Record<string, number> = {};
  for (const s of series) {
    totals[s.action] = s.total;
  }

  return {
    startTime: result.startTime.toISOString(),
    endTime: result.endTime.toISOString(),
    granularity,
    series,
    totals,
  };
}
