import type { EventSchema } from './schema-data';
import type {
  MetricsDataRow,
  QueryMetadata,
  MetricsQueryResponse,
} from './types';

export function escapeCsvValue(
  value: string | number | boolean | null | undefined
): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function getRollupColumnName(
  measure: string,
  aggregation: string
): string {
  return `${measure}_${aggregation}`;
}

export function formatCsv(
  data: MetricsDataRow[],
  groupBy: string[],
  rollupColumn: string
): string {
  const columns = ['timestamp', ...groupBy, rollupColumn];
  const header = columns.join(',');
  const rows = data.map(row =>
    columns.map(col => escapeCsvValue(row[col])).join(',')
  );
  return header + '\n' + (rows.length > 0 ? rows.join('\n') + '\n' : '');
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

export function formatSchemaListCsv(
  events: Array<{ name: string; description: string }>
): string {
  const header = 'event,description';
  const rows = events.map(
    e => `${escapeCsvValue(e.name)},${escapeCsvValue(e.description)}`
  );
  return header + '\n' + rows.join('\n') + '\n';
}

export function formatSchemaDetailCsv(
  event: EventSchema & { name: string }
): string {
  // Dimensions table
  const dimHeader = 'dimension,label,filterOnly';
  const dimRows = event.dimensions.map(
    d => `${escapeCsvValue(d.name)},${escapeCsvValue(d.label)},${d.filterOnly}`
  );
  const dimBlock = dimHeader + '\n' + dimRows.join('\n') + '\n';

  // Measures table
  const measureHeader = 'measure,label,unit';
  const measureRows = event.measures.map(
    m =>
      `${escapeCsvValue(m.name)},${escapeCsvValue(m.label)},${escapeCsvValue(m.unit)}`
  );
  const measureBlock = measureHeader + '\n' + measureRows.join('\n') + '\n';

  return dimBlock + '\n' + measureBlock;
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
