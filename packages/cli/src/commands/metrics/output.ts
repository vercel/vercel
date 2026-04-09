import type { QueryMetadata, MetricsQueryResponse } from './types';

interface SchemaDetailMetric {
  id: string;
  description: string;
  unit: string;
  aggregations: string[];
  defaultAggregation: string;
}

interface SchemaDetailDimension {
  name: string;
  label: string;
}

interface SchemaDetailJson {
  id: string;
  description: string;
  dimensions: SchemaDetailDimension[];
  metrics: SchemaDetailMetric[];
}

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

export function formatSchemaListJson(
  metrics: Array<{ id: string; description: string }>
): string {
  return JSON.stringify(metrics, null, 2);
}

export function formatSchemaDetailJson(detail: SchemaDetailJson): string {
  return JSON.stringify(detail, null, 2);
}

export function formatErrorJson(
  code: string,
  message: string,
  allowedValues?: string[]
): string {
  const error: { code: string; message: string; allowedValues?: string[] } = {
    code,
    message,
  };
  if (allowedValues && allowedValues.length > 0) {
    error.allowedValues = allowedValues;
  }
  return JSON.stringify({ error }, null, 2);
}
