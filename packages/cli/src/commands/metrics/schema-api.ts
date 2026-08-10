import type Client from '../../util/client';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { formatErrorJson, handleApiError } from './output';
import type { Aggregation, MetricDetail, MetricDetailResponse } from './types';

const OBSERVABILITY_API_URL = 'https://observability-api.vercel.sh';
const METRIC_CATALOG_PAGE_SIZE = 250;

export interface MetricCatalogMetric {
  readonly id: string;
  readonly description: string;
  readonly dimensions: readonly string[];
  readonly unit: string;
  readonly aggregations: readonly string[];
  readonly aggregationModifiers?: Readonly<
    Record<
      string,
      {
        readonly per?: readonly string[];
        readonly normalize?: readonly string[];
      }
    >
  >;
}

interface MetricCatalogResponse {
  metrics: MetricCatalogMetric[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

function toMetricDetail(metric: MetricDetailResponse[number]): MetricDetail {
  return {
    id: metric.id,
    description: metric.description,
    dimensions: metric.dimensions,
    unit: metric.unit,
    aggregations: metric.aggregations as Aggregation[],
    defaultAggregation: metric.defaultAggregation as Aggregation,
  };
}

export function getDefaultAggregation(
  detail: MetricDetail[],
  metricId: string
): Aggregation | undefined {
  return detail.find(metric => metric.id === metricId)?.defaultAggregation;
}

export async function fetchMetricCatalog(
  client: Client,
  accountId: string,
  search?: string
): Promise<MetricCatalogMetric[]> {
  const metrics: MetricCatalogMetric[] = [];
  let cursor: string | null = null;

  do {
    const baseUrl =
      client.apiUrl === 'https://api.vercel.com'
        ? OBSERVABILITY_API_URL
        : client.apiUrl;
    const url = new URL('/v1/metrics', baseUrl);
    url.searchParams.set('limit', String(METRIC_CATALOG_PAGE_SIZE));
    url.searchParams.set('includeLogs', 'false');
    if (search) {
      url.searchParams.set('search', search);
    }
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await client.fetch<MetricCatalogResponse>(url.href, {
      accountId,
    });
    metrics.push(...response.metrics);
    cursor = response.pagination.hasMore
      ? response.pagination.nextCursor
      : null;
  } while (cursor);

  return metrics
    .filter(metric => !search || metric.id.startsWith(search))
    .sort((left, right) => left.id.localeCompare(right.id));
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

export async function fetchMetricCatalogOrExit(
  client: Client,
  accountId: string,
  jsonOutput: boolean,
  search?: string
): Promise<MetricCatalogMetric[] | number> {
  try {
    return await fetchMetricCatalog(client, accountId, search);
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
