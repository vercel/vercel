import type Client from '../../util/client';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { formatErrorJson, handleApiError } from './output';
import type {
  Aggregation,
  MetricDimension,
  MetricDetail,
  MetricDetailResponse,
  MetricListItem,
  MetricListResponse,
} from './types';

const WEB_ANALYTICS_PAGEVIEW_DIMENSIONS: MetricDimension[] = [
  { name: 'project_id', label: 'Project' },
  { name: 'environment', label: 'Environment' },
  { name: 'request_hostname', label: 'Request Hostname' },
  { name: 'request_path', label: 'Request Path' },
  { name: 'referrer_hostname', label: 'Referrer Hostname' },
  { name: 'route', label: 'Route' },
  { name: 'country', label: 'Country' },
  { name: 'device_type', label: 'Device Type' },
  { name: 'device_id', label: 'Device Id' },
  { name: 'os_name', label: 'Operating System' },
  { name: 'browser_name', label: 'Browser' },
  { name: 'utm_source', label: 'UTM Source' },
  { name: 'utm_medium', label: 'UTM Medium' },
  { name: 'utm_campaign', label: 'UTM Campaign' },
  { name: 'utm_content', label: 'UTM Content' },
  { name: 'utm_term', label: 'UTM Term' },
  { name: 'flags', label: 'Flag' },
];

const WEB_ANALYTICS_EVENT_DIMENSIONS: MetricDimension[] = [
  ...WEB_ANALYTICS_PAGEVIEW_DIMENSIONS,
  { name: 'event_name', label: 'Analytics event name' },
  { name: 'event_data', label: 'Event Data' },
];

function withWebAnalyticsDimensionFallbacks(
  metricId: string,
  dimensions: MetricDimension[]
): MetricDimension[] {
  const fallbackDimensions =
    metricId === 'vercel.analytics_pageview.count'
      ? WEB_ANALYTICS_PAGEVIEW_DIMENSIONS
      : metricId === 'vercel.analytics_event.count'
        ? WEB_ANALYTICS_EVENT_DIMENSIONS
        : undefined;

  if (!fallbackDimensions) {
    return dimensions;
  }

  const dimensionByName = new Map(
    dimensions.map(dimension => [dimension.name, dimension])
  );
  for (const dimension of fallbackDimensions) {
    if (!dimensionByName.has(dimension.name)) {
      dimensionByName.set(dimension.name, dimension);
    }
  }

  return [...dimensionByName.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function toMetricDetail(metric: MetricDetailResponse[number]): MetricDetail {
  return {
    id: metric.id,
    description: metric.description,
    dimensions: withWebAnalyticsDimensionFallbacks(
      metric.id,
      metric.dimensions
    ),
    unit: metric.unit,
    aggregations: metric.aggregations as Aggregation[],
    defaultAggregation: metric.defaultAggregation as Aggregation,
  };
}

export function getMetricIds(metrics: MetricListItem[]): string[] {
  return metrics.map(metric => metric.id).sort();
}

export function getDefaultAggregation(
  detail: MetricDetail[],
  metricId: string
): Aggregation | undefined {
  return detail.find(metric => metric.id === metricId)?.defaultAggregation;
}

export async function fetchMetricList(
  client: Client,
  accountId: string
): Promise<MetricListItem[]> {
  const { metrics } = await client.fetch<MetricListResponse>(
    '/v2/observability/schema',
    { accountId }
  );
  return metrics;
}

export async function fetchMetricDetail(
  client: Client,
  accountId: string,
  metricId: string
): Promise<MetricDetail[]> {
  const detail = await client.fetch<MetricDetailResponse>(
    `/v2/observability/schema/${encodeURIComponent(metricId)}`,
    { accountId }
  );

  return detail.map(toMetricDetail);
}

export async function fetchMetricListOrExit(
  client: Client,
  accountId: string,
  jsonOutput: boolean
): Promise<MetricListItem[] | number> {
  try {
    return await fetchMetricList(client, accountId);
  } catch (err: unknown) {
    if (isAPIError(err)) {
      return handleApiError(err, jsonOutput, client, {
        401: {
          code: 'SCHEMA_UNAUTHORIZED',
          message:
            'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.',
        },
        403: {
          code: 'SCHEMA_UNAUTHORIZED',
          message:
            'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.',
        },
      });
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
): Promise<MetricDetail[] | number> {
  try {
    return await fetchMetricDetail(client, accountId, metricId);
  } catch (err: unknown) {
    if (isAPIError(err)) {
      return handleApiError(err, jsonOutput, client, {
        401: {
          code: 'SCHEMA_UNAUTHORIZED',
          message:
            'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.',
        },
        403: {
          code: 'SCHEMA_UNAUTHORIZED',
          message:
            'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.',
        },
      });
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
