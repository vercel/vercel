import type Client from '../client';
import { getRollupColumnName } from '../../commands/metrics/output';
import type {
  Granularity,
  MetricsQueryRequest,
  MetricsQueryResponse,
} from '../../commands/metrics/types';
import {
  ActivityTimeoutError,
  FIREWALL_ACTION_METRIC,
} from './get-firewall-metrics';

/** Cold ClickHouse queries can be slow; fail instead of hanging forever. */
const QUERY_TIMEOUT_MS = 45_000;

/**
 * The rule dimension on `vercel.firewall_action.count`, and the dashboard's
 * exclusion of rows naming neither a rule nor an action. Those rows carry no
 * attribution, and left in they crowd out the rules a top-list is asked for.
 */
export const RULE_ID_DIMENSION = 'waf_rule_id';
export const RULE_TRAFFIC_FILTER = `(${RULE_ID_DIMENSION} ne '') and (waf_action ne '')`;

interface BaseQueryOpts {
  ownerId: string;
  projectId: string;
  filter?: string;
  startTime: Date;
  endTime: Date;
  timeoutMs?: number;
}

async function queryObservability(
  client: Client,
  opts: BaseQueryOpts & {
    groupBy: string[];
    granularity: Granularity;
    limit: number;
  }
): Promise<{ response: MetricsQueryResponse; rollupColumn: string }> {
  const rollupColumn = getRollupColumnName(FIREWALL_ACTION_METRIC, 'sum');

  const body: MetricsQueryRequest = {
    scope: {
      type: 'project',
      ownerId: opts.ownerId,
      projectIds: [opts.projectId],
    },
    metric: FIREWALL_ACTION_METRIC,
    aggregation: 'sum',
    startTime: opts.startTime.toISOString(),
    endTime: opts.endTime.toISOString(),
    granularity: opts.granularity,
    groupBy: opts.groupBy,
    filter: opts.filter,
    limit: opts.limit,
    orderBy: rollupColumn,
    orderDirection: 'desc',
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
      throw new ActivityTimeoutError(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for firewall traffic data.`
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
