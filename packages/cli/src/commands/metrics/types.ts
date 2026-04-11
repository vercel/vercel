export type Aggregation =
  | 'sum'
  | 'persecond'
  | 'percent'
  | 'unique'
  | 'avg'
  | 'min'
  | 'max'
  | 'p50'
  | 'p75'
  | 'p90'
  | 'p95'
  | 'p99'
  | 'stddev';

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

export interface MetricListItem {
  id: string;
  description: string;
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
  groupBy?: string[];
  filter?: string;
  limit?: number;
  orderBy?: string;
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
}

export interface MetricsQueryResponse {
  data?: MetricsDataRow[];
  summary: MetricsSummaryRow[];
  statistics: MetricsQueryStatistics;
}

export type ValidationError = {
  valid: false;
  code: string;
  message: string;
  allowedValues?: string[];
};

export type ValidationResult = { valid: true } | ValidationError;

export type ValidatedResult<T> = { valid: true; value: T } | ValidationError;
