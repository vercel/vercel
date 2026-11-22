import type Client from '../client';
import output from '../../output-manager';
import { OBSERVABILITY_METRICS_PATH } from '../../commands/metrics/schema-api';
import type {
  CanonicalMetricsQueryRequest,
  CanonicalMetricsQueryResponse,
} from '../../commands/metrics/types';

export const FLAG_EVALUATIONS_METRIC = 'vercel.flags.evaluation';
export const FLAG_EVALUATIONS_AGGREGATION = 'sum';

const EVALUATIONS_TIMEOUT_MS = 5_000;

export interface CountFlagEvaluationsOptions {
  ownerId: string;
  projectId: string;
  flagSlug: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Total reported evaluations for one flag in the time range, or `null` when
 * the metrics query fails. Callers treat `null` as "unknown", not as zero.
 */
export async function countFlagEvaluations(
  client: Client,
  options: CountFlagEvaluationsOptions
): Promise<number | null> {
  const { ownerId, projectId, flagSlug, startTime, endTime } = options;

  try {
    const body: CanonicalMetricsQueryRequest = {
      scope: { ownerId, projectIds: [projectId] },
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      },
      metrics: {
        value: {
          metric: FLAG_EVALUATIONS_METRIC,
          aggregation: FLAG_EVALUATIONS_AGGREGATION,
        },
      },
      outputs: ['value'],
      filter: `flagKey:${JSON.stringify(flagSlug)}`,
    };
    const response = await client.fetch<CanonicalMetricsQueryResponse>(
      OBSERVABILITY_METRICS_PATH,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        accountId: ownerId,
        signal: AbortSignal.timeout(EVALUATIONS_TIMEOUT_MS),
        retry: { retries: 0 },
        bailOn429: true,
      }
    );

    let total = 0;
    for (const row of response.summary ?? []) {
      const value = Number(row.values.value);
      if (Number.isFinite(value)) {
        total += value;
      }
    }
    return total;
  } catch (err) {
    output.debug(
      `Could not count evaluations for flag ${flagSlug}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
