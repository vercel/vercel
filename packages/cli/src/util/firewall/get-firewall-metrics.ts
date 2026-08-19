import type Client from '../client';
import { getRollupColumnName } from '../../commands/metrics/output';
import type {
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
  granularity: { hours: number };
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
 * Fetch 1-day Requests-by-Action totals + hourly timeseries via the
 * observability metrics API used by `vercel metrics`.
 */
export default async function getFirewallMetrics(
  client: Client,
  opts: {
    projectId: string;
    ownerId: string;
    /** Defaults to past 24 hours. */
    sinceMs?: number;
    timeoutMs?: number;
  }
): Promise<FirewallMetricsResult> {
  const end = new Date();
  const start = new Date(end.getTime() - (opts.sinceMs ?? 24 * 60 * 60 * 1000));
  const granularity = { hours: 1 } as const;
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
    // 24h × ~6 actions ≈ 144 points; keep the query cheap.
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
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for firewall metrics. Re-run the command — the next try is usually faster.`
      );
    }
    throw err;
  }

  const byAction = new Map<string, FirewallActionSeries>();
  const hasSummary = Boolean(response.summary && response.summary.length > 0);

  for (const row of response.summary ?? []) {
    const action = actionFromRow(row as Record<string, unknown>);
    const total = valueFromRow(row as Record<string, unknown>);
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
    if (!hasSummary) {
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
