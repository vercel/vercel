import type Client from '../../util/client';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { formatErrorJson } from './output';
import type {
  Aggregation,
  MetricSchemaDetail,
  MetricLeafSummary,
} from './types';

export type MetricListItem = {
  id: string;
  description: string;
};

interface SchemaListResponse {
  metrics: MetricListItem[];
}

interface SchemaDetailResponse {
  id: string;
  description: string;
  dimensions: Array<{
    name: string;
    label: string;
  }>;
  metrics: Array<{
    id: string;
    description: string;
    unit: string;
    aggregations: string[];
    defaultAggregation: string;
  }>;
}

function toLeafSummary(
  metric: SchemaDetailResponse['metrics'][number]
): MetricLeafSummary {
  return {
    id: metric.id,
    description: metric.description,
    unit: metric.unit,
    aggregations: metric.aggregations as Aggregation[],
    defaultAggregation: metric.defaultAggregation as Aggregation,
  };
}

export function getMetricIds(metrics: MetricListItem[]): string[] {
  return metrics.map(metric => metric.id).sort();
}

export function getDefaultAggregation(
  detail: MetricSchemaDetail,
  metricId: string
): Aggregation | undefined {
  return detail.metrics.find(metric => metric.id === metricId)
    ?.defaultAggregation;
}

export function getAggregations(
  detail: MetricSchemaDetail,
  metricId: string
): readonly Aggregation[] {
  return (
    detail.metrics.find(metric => metric.id === metricId)?.aggregations ?? []
  );
}

export function getDimensions(detail: MetricSchemaDetail) {
  return detail.dimensions;
}

export async function fetchMetricList(
  client: Client,
  accountId: string
): Promise<MetricListItem[]> {
  const { metrics } = await client.fetch<SchemaListResponse>(
    '/v2/observability/schema',
    { accountId }
  );
  return metrics;
}

export async function fetchMetricDetail(
  client: Client,
  accountId: string,
  metricId: string
): Promise<MetricSchemaDetail> {
  const detail = await client.fetch<SchemaDetailResponse>(
    `/v2/observability/schema/${encodeURIComponent(metricId)}`,
    { accountId }
  );

  return {
    id: detail.id,
    description: detail.description,
    dimensions: detail.dimensions,
    metrics: detail.metrics.map(toLeafSummary),
  };
}

export async function fetchMetricListOrExit(
  client: Client,
  accountId: string,
  jsonOutput: boolean
): Promise<MetricListItem[] | number> {
  try {
    return await fetchMetricList(client, accountId);
  } catch (err: unknown) {
    if (isAPIError(err) && (err.status === 401 || err.status === 403)) {
      const message =
        'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.';

      if (jsonOutput) {
        client.stdout.write(formatErrorJson('SCHEMA_UNAUTHORIZED', message));
      } else {
        output.error(message);
      }
      return 1;
    }

    const message =
      err instanceof Error
        ? `Failed to fetch metrics schema: ${err.message}`
        : `Failed to fetch metrics schema: ${String(err)}`;
    if (jsonOutput) {
      client.stdout.write(formatErrorJson('SCHEMA_FETCH_FAILED', message));
    } else {
      output.error(message);
    }
    return 1;
  }
}

export async function fetchMetricDetailOrExit(
  client: Client,
  accountId: string,
  metricId: string,
  jsonOutput: boolean
): Promise<MetricSchemaDetail | number> {
  try {
    return await fetchMetricDetail(client, accountId, metricId);
  } catch (err: unknown) {
    if (isAPIError(err) && (err.status === 401 || err.status === 403)) {
      const message =
        'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.';

      if (jsonOutput) {
        client.stdout.write(formatErrorJson('SCHEMA_UNAUTHORIZED', message));
      } else {
        output.error(message);
      }
      return 1;
    }

    if (isAPIError(err) && err.status === 400) {
      const message = err.serverMessage || `Unknown metric "${metricId}".`;
      if (jsonOutput) {
        client.stdout.write(
          formatErrorJson(err.code || 'BAD_REQUEST', message)
        );
      } else {
        output.error(message);
      }
      return 1;
    }

    const message =
      err instanceof Error
        ? `Failed to fetch metrics schema: ${err.message}`
        : `Failed to fetch metrics schema: ${String(err)}`;
    if (jsonOutput) {
      client.stdout.write(formatErrorJson('SCHEMA_FETCH_FAILED', message));
    } else {
      output.error(message);
    }
    return 1;
  }
}
