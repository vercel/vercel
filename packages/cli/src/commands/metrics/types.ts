export interface MetricsOptions {
  // Event type (required)
  event: string;

  // Metric selection
  measure: string;
  aggregation: string;

  // Grouping
  by: string[];
  limit: number;

  // Filter shortcuts
  status?: string;
  error?: string;
  path?: string;
  method?: string;
  region?: string;

  // Advanced filter
  filter?: string;

  // Time range
  since?: string;
  until?: string;
  granularity?: string;

  // Scope
  project?: string;
  environment?: string;
  deployment?: string;

  // Output
  json: boolean;
  summary: boolean;
}

export interface QueryScope {
  type: 'project-with-slug';
  teamSlug: string;
  projectName: string;
}

export interface RollupDefinition {
  measure: string;
  aggregation: string;
}

export interface SonarQuery {
  scope: QueryScope;
  reason: string;
  event: string;
  rollups: Record<string, RollupDefinition>;
  groupBy: string[];
  filter?: string;
  limit: number;
  tailRollup: 'truncate' | 'others';
  granularity: string;
  startTime: string;
  endTime: string;
  summaryOnly: boolean;
}

export interface MetricsDataPoint {
  timestamp: string;
  [key: string]: string | number;
}

export interface MetricsSummaryItem {
  value: number;
  [key: string]: string | number;
}

export interface MetricsResponse {
  summary: MetricsSummaryItem[];
  data: MetricsDataPoint[];
  statistics: {
    totalGroups: number;
    totalValue: number;
  };
}

export interface EventDef {
  name: string;
  label: string;
}

export interface DimensionDef {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  highCardinality?: boolean;
}

export interface MeasureDef {
  name: string;
  label: string;
  unit: string;
  aggregations: string[];
}
