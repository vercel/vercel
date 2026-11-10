export const AGGREGATIONS = [
  'count',
  'sum',
  'persecond',
  'percent',
  'unique',
  'avg',
  'min',
  'max',
  'p50',
  'p75',
  'p90',
  'p95',
  'p99',
  'stddev',
] as const;

export type Aggregation = (typeof AGGREGATIONS)[number];

export const CANONICAL_AGGREGATIONS = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'p50',
  'p75',
  'p90',
  'p95',
  'p99',
  'stddev',
] as const satisfies readonly Aggregation[];

export type CanonicalAggregation = (typeof CANONICAL_AGGREGATIONS)[number];

export function isCanonicalAggregation(
  aggregation: string
): aggregation is CanonicalAggregation {
  return (CANONICAL_AGGREGATIONS as readonly string[]).includes(aggregation);
}

export type OrderDirection = 'asc' | 'desc';
export type OrderBy = 'value' | 'count';

export interface ProjectScope {
  type: 'project';
  ownerId: string;
  projectIds: [string];
}

export interface TeamScope {
  type: 'owner';
  ownerId: string;
}

export type Scope = ProjectScope | TeamScope;

export type Granularity =
  | { minutes: number }
  | { hours: number }
  | { days: number };

export interface MetricDimension {
  name: string;
  label: string;
}

export interface MetricDetail {
  id: string;
  description: string;
  dimensions: MetricDimension[];
  unit: string;
  aggregations: Aggregation[];
  defaultAggregation: Aggregation;
}

export type MetricDetailResponse = MetricDetail[];

export interface MetricListItem {
  id: string;
  description: string;
}

export interface MetricListResponse {
  metrics: MetricListItem[];
}

export interface MetricsQueryRequest {
  scope: Scope;
  metric: string;
  aggregation?: Aggregation;
  startTime: string;
  endTime: string;
  granularity: Granularity;
  bucketTimezone?: string;
  groupBy?: string[];
  filter?: string;
  limit?: number;
  orderBy?: string;
  orderDirection?: OrderDirection;
}

export type MetricsApiDataCell = string | number | null;
export type MetricsSummaryDataCell = string | number | null;

export type MetricsDataRow = { timestamp: string } & Record<
  string,
  MetricsApiDataCell
>;

export type MetricsSummaryRow = Record<string, MetricsSummaryDataCell>;

export interface MetricsQueryStatistics {
  rowsRead?: number;
  bytesRead?: number;
  dbTimeSeconds?: number;
  engineTimeSeconds?: number;
  queryTable?: string;
  cacheEngineTimeSeconds?: number;
  cacheDbTimeSeconds?: number;
}

export interface QueryMetadata {
  metric: string;
  aggregation: Aggregation;
  groupBy: string[];
  filter: string | undefined;
  startTime: string;
  endTime: string;
  granularity: Granularity;
  bucketTimezone?: string;
  orderBy?: OrderBy;
  orderDirection?: OrderDirection;
}

export interface MetricsQueryResponse {
  data?: MetricsDataRow[];
  summary: MetricsSummaryRow[];
  statistics: MetricsQueryStatistics;
  orderBy?: string;
  orderDirection?: OrderDirection;
}

export interface CanonicalMetricSelection {
  metric: string;
  aggregation: string;
  dimensions?: string[];
  per?: 'second';
  normalize?: 'percent';
  filter?: string;
}

export interface CanonicalMetricsQueryRequest {
  scope: {
    ownerId: string;
    projectIds?: string[];
  };
  timeRange: {
    start: string;
    end: string;
  };
  /**
   * Bucket width for a timeseries. Omitted asks for a summary alone, which is
   * what `orderBy` and `rowLimit` narrow — those two are rejected when it is
   * present, and `seriesSelection` requires it.
   */
  bucketSeconds?: number;
  groupBy?: string[];
  filter?: string;
  metrics: Record<string, CanonicalMetricSelection>;
  outputs: string[];
  /**
   * Summary-query ordering and row cap. Rejected alongside `bucketSeconds`:
   * a bucketed result is complete or it fails, and a grouped one narrows
   * through `seriesSelection` instead.
   */
  orderBy?: Array<{ metric: string; direction: OrderDirection }>;
  rowLimit?: number;
  seriesSelection?: {
    limit: number;
    /**
     * `approximate` lets the API serve the query from a sampled read of the
     * raw source, which is what keeps a high-cardinality top-N inside the
     * per-day query-bytes budget. Only worth asking for where the selection
     * really is a top-N: it buys nothing over a group set the limit already
     * covers, and the response does not say whether sampling was applied.
     */
    mode: 'exact' | 'approximate';
    rankBy: Array<{ metric: string; direction: OrderDirection }>;
  };
}

export interface CanonicalMetricsQueryResponse {
  series?: Array<{
    timestamp: string;
    dimensions: Record<string, string | null>;
    values: Record<string, number | null>;
  }>;
  summary: Array<{
    dimensions: Record<string, string | null>;
    values: Record<string, number | null>;
  }>;
  queryId: string;
  meta: {
    sources: Array<{ id: string }>;
    statistics: {
      elapsedMs: number;
      databaseElapsedMs: number;
      rowsRead: number;
      bytesRead: number;
    };
  };
}

export type ValidationError = {
  valid: false;
  code: string;
  message: string;
  allowedValues?: string[];
};

export type ValidationResult = { valid: true } | ValidationError;

export type ValidatedResult<T> = { valid: true; value: T } | ValidationError;
