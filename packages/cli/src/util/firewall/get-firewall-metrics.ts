import type Client from '../client';
import { isAPIError } from '../errors-ts';
import { getRollupColumnName } from '../../commands/metrics/output';
import type {
  Granularity,
  MetricsQueryRequest,
  MetricsQueryResponse,
} from '../../commands/metrics/types';

export const FIREWALL_ACTION_METRIC = 'vercel.firewall_action.count';
const FIREWALL_ACTION_AGGREGATION = 'sum';
// The API flattens `metric_aggregation` into a single column name, e.g.
// `vercel_firewall_action_count_sum`. That column holds each row's value.
const ROLLUP_COLUMN = getRollupColumnName(
  FIREWALL_ACTION_METRIC,
  FIREWALL_ACTION_AGGREGATION
);

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

export function isActivityTimeout(error: unknown): boolean {
  return (
    (isAPIError(error) && error.status === 408) ||
    (error instanceof Error && error.name === 'ActivityTimeoutError')
  );
}

/** Cold ClickHouse queries can be slow; fail instead of hanging forever. */
const METRICS_TIMEOUT_MS = 45_000;

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

function actionFromRow(row: Record<string, unknown>): string {
  const raw = row.waf_action ?? row.wafAction ?? 'unknown';
  return String(raw);
}

function valueFromRow(row: Record<string, unknown>): number {
  const raw = row[ROLLUP_COLUMN] ?? row.value ?? row.count ?? 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetch Requests-by-Action totals + hourly timeseries over the given window,
 * via the observability metrics API used by `vercel metrics`.
 *
 * The window is the caller's, not ours: every panel of the activity block has
 * to cover the same period, and a window derived here would be one the other
 * queries could only learn by waiting for this one to answer.
 */
export default async function getFirewallMetrics(
  client: Client,
  opts: {
    projectId: string;
    ownerId: string;
    startTime: Date;
    endTime: Date;
    granularity?: Granularity;
    filter?: string;
    timeoutMs?: number;
  }
): Promise<FirewallMetricsResult> {
  const { startTime: start, endTime: end } = opts;
  const granularity = opts.granularity ?? ({ hours: 1 } as const);
  const timeoutMs = opts.timeoutMs ?? METRICS_TIMEOUT_MS;

  const body: MetricsQueryRequest = {
    scope: {
      type: 'project',
      ownerId: opts.ownerId,
      projectIds: [opts.projectId],
    },
    metric: FIREWALL_ACTION_METRIC,
    aggregation: FIREWALL_ACTION_AGGREGATION,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    granularity,
    groupBy: ['waf_action'],
    filter: opts.filter,
    // Caps series, not points, so this is well clear of the handful of
    // actions a firewall can report.
    limit: 100,
  };

  let response: MetricsQueryResponse;
  try {
    response = await client.fetch<MetricsQueryResponse>(
      '/v2/observability/query',
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        accountId: opts.ownerId,
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    ) {
      throw new ActivityTimeoutError(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for firewall metrics.`
      );
    }
    throw err;
  }

  const byAction = new Map<string, FirewallActionSeries>();
  // Which actions `summary` gave a total for, tracked per action rather than
  // for the response as a whole. An action can appear in `data` alone, and
  // its total then has to come from accumulating those rows; deciding that
  // once for every action reports 0 for such a series alongside a non-empty
  // timeseries.
  const totalFromSummary = new Set<string>();

  for (const row of response.summary ?? []) {
    const action = actionFromRow(row as Record<string, unknown>);
    const total = valueFromRow(row as Record<string, unknown>);
    totalFromSummary.add(action);
    byAction.set(action, {
      action,
      total,
      timeseries: [],
    });
  }

  for (const row of response.data ?? []) {
    const action = actionFromRow(row as Record<string, unknown>);
    const value = valueFromRow(row as Record<string, unknown>);
    const timestamp = String(row.timestamp);
    let series = byAction.get(action);
    if (!series) {
      series = { action, total: 0, timeseries: [] };
      byAction.set(action, series);
    }
    series.timeseries.push({ timestamp, value });
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
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    granularity,
    series,
    totals,
  };
}
