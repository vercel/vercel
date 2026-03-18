import type { Aggregation } from '@vercel/o11y-tools/query-engine/types';

export interface ProjectScope {
  type: 'project-with-slug';
  teamSlug: string;
  projectName: string;
}

export interface TeamScope {
  type: 'team-with-slug';
  teamSlug: string;
}

export type Scope = ProjectScope | TeamScope;

export type Granularity =
  | { minutes: number }
  | { hours: number }
  | { days: number };

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
  event: string;
  measure: string;
  aggregation: Aggregation;
  groupBy: string[];
  filter: string | undefined;
  startTime: string;
  endTime: string;
  granularity: Granularity;
}

export interface MetricsQueryRequest {
  reason: 'agent';
  scope: Scope;
  event: string;
  rollups: Record<string, { measure: string; aggregation: Aggregation }>;
  startTime: string;
  endTime: string;
  granularity: Granularity;
  groupBy?: string[];
  filter?: string;
  limit?: number;
  orderBy?: string;
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
