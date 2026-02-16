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

export interface MetricsQueryRequest {
  reason: 'agent';
  scope: Scope;
  event: string;
  rollups: Record<string, { measure: string; aggregation: string }>;
  startTime: string;
  endTime: string;
  granularity: Record<string, number>;
  groupBy?: string[];
  filter?: string;
  limit?: number;
  limitRanking: 'top_by_summary';
  tailRollup: 'truncate';
  orderBy?: string;
}

export interface MetricsQueryResponse {
  data?: Array<Record<string, any>>;
  summary?: Array<Record<string, any>>;
  query?: Record<string, any>;
  statistics: {
    rowsRead?: number;
    bytesRead?: number;
    dbTimeSeconds?: number;
    engineTimeSeconds?: number;
  };
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; code: string; message: string; allowedValues?: string[] };
