import type Client from './client';

export interface Duration {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

export interface RollupDefinition {
  measure: string;
  aggregation: string;
  dimensions?: string[];
  filter?: string;
}

export interface Query {
  event: string;
  rollups: Record<string, RollupDefinition>;
  startTime: Date;
  endTime: Date;
  filter?: string;
  granularity?: Duration;
  groupBy?: string[];
  limit?: number;
  limitRanking?: 'top_by_summary' | 'top_by_last_bucket';
  orderBy?: string;
  summaryOnly?: boolean;
  tailRollup?: 'truncate' | 'others';
}

export interface QueryStatistics {
  rowsRead?: number;
  bytesRead?: number;
  dbTimeSeconds?: number;
  engineTimeSeconds?: number;
  queryTable?: string;
  cacheEngineTimeSeconds?: number;
  cacheDbTimeSeconds?: number;
}

export interface TimeseriesDataPoint {
  timestamp: string;
  [key: string]: any; // Dynamic fields based on groupBy and rollups
}

export interface SummaryDataPoint {
  [key: string]: any; // Dynamic fields based on groupBy and rollups
}

export interface QueryResponse {
  data?: TimeseriesDataPoint[];
  summary: SummaryDataPoint[];
  statistics: QueryStatistics;
  query?: Query;
  queryId?: string;
  cacheTime?: number;
  fromCache?: boolean;
}

const OBSERVABILITY_API_URL = 'https://api.vercel.com/v1/observability/query';

export async function executeObservabilityQuery(
  client: Client,
  query: Query
): Promise<QueryResponse> {
  // Convert Date objects to ISO strings for the API
  const body = {
    ...query,
    startTime: query.startTime.toISOString(),
    endTime: query.endTime.toISOString(),
  };

  // Make POST request to observability API
  // The endpoint handles scope/owner automatically based on authentication
  const response = await client.fetch<QueryResponse>(OBSERVABILITY_API_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response;
}
