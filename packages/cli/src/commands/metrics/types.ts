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

export type MetricsDataRow = Record<string, string | number | null>;

export interface QueryMetadata {
  event: string;
  measure: string;
  aggregation: string;
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
  rollups: Record<string, { measure: string; aggregation: string }>;
  startTime: string;
  endTime: string;
  granularity: Granularity;
  groupBy?: string[];
  filter?: string;
  limit?: number;
  limitRanking: 'top_by_summary';
  tailRollup: 'truncate';
  orderBy?: string;
}

export interface MetricsQueryResponse {
  data?: MetricsDataRow[];
  summary?: MetricsDataRow[];
  statistics: {
    rowsRead?: number;
    bytesRead?: number;
    dbTimeSeconds?: number;
    engineTimeSeconds?: number;
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
