import type { EventSchema } from './schema-data';
import type { QueryMetadata, MetricsQueryResponse } from './types';

export function getRollupColumnName(
  measure: string,
  aggregation: string
): string {
  return `${measure}_${aggregation}`;
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

export function formatSchemaDetailJson(
  event: EventSchema & { name: string },
  aggregations: readonly string[]
): string {
  const dimensions = event.dimensions.map(d => {
    const obj: { name: string; label: string; filterOnly?: boolean } = {
      name: d.name,
      label: d.label,
    };
    if (d.filterOnly) {
      obj.filterOnly = true;
    }
    return obj;
  });

  return JSON.stringify(
    {
      event: event.name,
      description: event.description,
      dimensions,
      measures: event.measures.map(m => ({
        name: m.name,
        label: m.label,
        unit: m.unit,
      })),
      aggregations: [...aggregations],
    },
    null,
    2
  );
}

export function formatSchemaListJson(
  events: Array<{ name: string; description: string }>
): string {
  return JSON.stringify(events, null, 2);
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
