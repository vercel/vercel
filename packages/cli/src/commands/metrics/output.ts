import type { QueryMetadata, MetricsQueryResponse } from './types';

export function getRollupColumnName(
  metric: string,
  aggregation: string
): string {
  return `${metric.replace(/\./g, '_')}_${aggregation}`;
}

export function formatQueryJson(
  query: QueryMetadata,
  response: MetricsQueryResponse
): string {
  return JSON.stringify(
    {
      query,
      summary: response.summary ?? [],
      data: response.data ?? [],
      statistics: response.statistics ?? {},
    },
    null,
    2
  );
}

export function formatErrorJson(code: string, message: string): string {
  const error: { code: string; message: string } = {
    code,
    message,
  };
  return JSON.stringify({ error }, null, 2);
}
