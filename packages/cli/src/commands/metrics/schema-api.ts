import type Client from '../../util/client';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { formatErrorJson, handleApiError } from './output';
import type {
  Aggregation,
  MetricDetail,
  MetricDetailResponse,
  MetricListItem,
  MetricListResponse,
} from './types';

export const OBSERVABILITY_METRICS_PATH = '/metrics/v1';
const METRIC_CATALOG_PAGE_SIZE = 250;

export interface MetricCatalogMetric {
  readonly id: string;
  readonly description: string;
  readonly dimensions: readonly string[];
  readonly unit: string;
  readonly aggregations: readonly string[];
}

type MetricCatalogKind = 'all' | 'system' | 'custom';

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

export async function fetchMetricCatalog(
  client: Client,
  accountId: string,
  kind: MetricCatalogKind,
  search?: string,
  activeSince?: string
): Promise<MetricCatalogMetric[]> {
  const metrics: MetricCatalogMetric[] = [];
  let cursor: string | null = null;

  do {
    const searchParams = new URLSearchParams({
      limit: String(METRIC_CATALOG_PAGE_SIZE),
      kind,
    });
    if (search) {
      searchParams.set('search', search);
    }
    if (activeSince) {
      searchParams.set('activeSince', activeSince);
    }
    if (cursor) {
      searchParams.set('cursor', cursor);
    }

    const response = await client.fetch<MetricCatalogResponse>(
      `${OBSERVABILITY_METRICS_PATH}?${searchParams}`,
      { accountId, bailOn429: true }
    );
    metrics.push(
      ...response.metrics.map(metric => ({
        id: metric.id,
        description: metric.description,
        dimensions: metric.dimensions,
        unit: metric.unit,
        aggregations: metric.aggregations,
      }))
    );
    cursor = response.pagination.hasMore
      ? response.pagination.nextCursor
      : null;
  } while (cursor);

  return metrics
    .filter(
      metric =>
        (kind === 'all' ||
          (kind === 'system'
            ? metric.id.startsWith('vercel.')
            : !metric.id.startsWith('vercel.'))) &&
        (!search || metric.id.startsWith(search))
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function fetchCustomMetricCatalog(
  client: Client,
  accountId: string,
  search?: string,
  activeSince?: string
): Promise<MetricCatalogMetric[]> {
  return fetchMetricCatalog(client, accountId, 'custom', search, activeSince);
}

async function fetchCatalogMetricDetail(
  client: Client,
  accountId: string,
  metricId: string,
  kind: MetricCatalogKind,
  activeSince?: string
): Promise<MetricCatalogMetric[]> {
  const metrics = await fetchMetricCatalog(
    client,
    accountId,
    kind,
    metricId,
    activeSince
  );
  const exactMetric = metrics.find(metric => metric.id === metricId);
  return exactMetric ? [exactMetric] : metrics;
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

async function fetchSchemaOrExit<T>(
  client: Client,
  jsonOutput: boolean,
  operation: () => Promise<T>
): Promise<T | number> {
  try {
    return await operation();
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

export function fetchCustomMetricDetailOrExit(
  client: Client,
  accountId: string,
  jsonOutput: boolean,
  metricId: string
): Promise<MetricCatalogMetric[] | number> {
  return fetchSchemaOrExit(client, jsonOutput, () =>
    fetchCatalogMetricDetail(client, accountId, metricId, 'custom')
  );
}

export function fetchCatalogMetricDetailOrExit(
  client: Client,
  accountId: string,
  jsonOutput: boolean,
  metricId: string,
  kind: MetricCatalogKind,
  activeSince?: string
): Promise<MetricCatalogMetric[] | number> {
  return fetchSchemaOrExit(client, jsonOutput, () =>
    fetchCatalogMetricDetail(client, accountId, metricId, kind, activeSince)
  );
}

export function fetchMetricCatalogListOrExit(
  client: Client,
  accountId: string,
  jsonOutput: boolean
): Promise<MetricListItem[] | number> {
  return fetchSchemaOrExit(client, jsonOutput, () =>
    fetchMetricCatalog(client, accountId, 'all').then(metrics =>
      metrics.map(({ id, description }) => ({ id, description }))
    )
  );
}

export function fetchCombinedMetricListOrExit(
  client: Client,
  accountId: string,
  jsonOutput: boolean
): Promise<MetricListItem[] | number> {
  return fetchSchemaOrExit(client, jsonOutput, async () => {
    const [platformMetrics, customMetrics] = await Promise.all([
      fetchMetricList(client, accountId),
      fetchCustomMetricCatalog(client, accountId).catch(() => []),
    ]);
    return [
      ...platformMetrics.filter(metric => metric.id.startsWith('vercel.')),
      ...customMetrics.map(({ id, description }) => ({ id, description })),
    ].sort((left, right) => left.id.localeCompare(right.id));
  });
}

export async function fetchMetricDetailOrExit(
  client: Client,
  accountId: string,
  metricId: string,
  jsonOutput: boolean
): Promise<MetricDetail[] | number> {
  return fetchSchemaOrExit(client, jsonOutput, () =>
    fetchMetricDetail(client, accountId, metricId)
  );
}
