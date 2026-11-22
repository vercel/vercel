import type {
  CanonicalMetricSelection,
  CanonicalMetricsQueryRequest,
  CanonicalMetricsQueryResponse,
  MetricsQueryRequest,
  MetricsQueryResponse,
  OrderBy,
  Scope,
} from './types';
import { toGranularityMsFromDuration } from './time-utils';

const VALUE_ALIAS = 'value';
const COUNT_ALIAS = '__seriesCount';

export function alignTimeRangeToGranularity(
  startTime: Date,
  endTime: Date,
  granularity: MetricsQueryRequest['granularity']
): { startTime: Date; endTime: Date } {
  const bucketMs = toGranularityMsFromDuration(granularity);
  return {
    startTime: new Date(Math.floor(startTime.getTime() / bucketMs) * bucketMs),
    endTime: new Date(Math.ceil(endTime.getTime() / bucketMs) * bucketMs),
  };
}

export function createCanonicalMetricsRequest(options: {
  scope: Scope;
  metric: string;
  selection: CanonicalMetricSelection;
  startTime: Date;
  endTime: Date;
  granularity: MetricsQueryRequest['granularity'];
  groupBy: string[];
  filter: string | undefined;
  limit: number;
  orderBy: OrderBy | undefined;
  orderDirection: 'asc' | 'desc' | undefined;
}): CanonicalMetricsQueryRequest {
  const metrics: Record<string, CanonicalMetricSelection> = {
    [VALUE_ALIAS]: options.selection,
  };
  let rankMetric = VALUE_ALIAS;
  if (
    options.groupBy.length > 0 &&
    options.orderBy === 'count' &&
    options.selection.aggregation !== 'count'
  ) {
    metrics[COUNT_ALIAS] = {
      metric: options.metric,
      aggregation: 'count',
    };
    rankMetric = COUNT_ALIAS;
  }

  return {
    scope: {
      ownerId: options.scope.ownerId,
      ...(options.scope.type === 'project'
        ? { projectIds: options.scope.projectIds }
        : {}),
    },
    timeRange: {
      start: options.startTime.toISOString(),
      end: options.endTime.toISOString(),
    },
    bucketSeconds: toGranularityMsFromDuration(options.granularity) / 1000,
    ...(options.groupBy.length > 0 ? { groupBy: options.groupBy } : {}),
    ...(options.filter ? { filter: options.filter } : {}),
    metrics,
    outputs: [VALUE_ALIAS],
    ...(options.groupBy.length > 0
      ? {
          seriesSelection: {
            limit: options.limit,
            mode: 'exact',
            rankBy: [
              {
                metric: rankMetric,
                direction: options.orderDirection ?? 'desc',
              },
            ],
          },
        }
      : {}),
  };
}

export function canonicalResponseToMetricsResponse(
  response: CanonicalMetricsQueryResponse,
  rollupColumn: string,
  orderBy: OrderBy | undefined,
  orderDirection: 'asc' | 'desc' | undefined
): MetricsQueryResponse {
  const toRow = (point: {
    dimensions: Record<string, string | null>;
    values: Record<string, number | null>;
  }) => ({
    ...point.dimensions,
    [rollupColumn]: point.values[VALUE_ALIAS] ?? null,
  });
  return {
    ...(response.series
      ? {
          data: response.series.map(point => ({
            timestamp: point.timestamp,
            ...toRow(point),
          })),
        }
      : {}),
    summary: response.summary.map(toRow),
    statistics: {
      rowsRead: response.meta.statistics.rowsRead,
      bytesRead: response.meta.statistics.bytesRead,
      dbTimeSeconds: response.meta.statistics.databaseElapsedMs / 1_000,
      engineTimeSeconds: response.meta.statistics.elapsedMs / 1_000,
      queryTable: [...new Set(response.meta.sources.map(source => source.id))]
        .sort()
        .join(','),
    },
    ...(orderBy ? { orderBy } : {}),
    ...(orderDirection ? { orderDirection } : {}),
  };
}
