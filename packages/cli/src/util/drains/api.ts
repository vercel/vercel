import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import { isAPIError } from '../errors-ts';

export type DrainType = 'logs' | 'traces' | 'analytics' | 'speed-insights';

export const DRAIN_TYPES: readonly DrainType[] = [
  'logs',
  'traces',
  'analytics',
  'speed-insights',
];

/** The schema and version the dashboard creates for each drain type. */
export const DRAIN_SCHEMAS: Record<
  DrainType,
  Record<string, { version: string }>
> = {
  logs: { log: { version: 'v1' } },
  traces: { trace: { version: 'v1' } },
  analytics: { analytics: { version: 'v2' } },
  'speed-insights': { speed_insights: { version: 'v1' } },
};

export const LOG_SOURCES = [
  'lambda',
  'edge',
  'static',
  'external',
  'build',
  'firewall',
  'redirect',
] as const;

export const DRAIN_ENVIRONMENTS = ['production', 'preview'] as const;

export interface HttpDelivery {
  type: 'http';
  endpoint: string;
  encoding: 'json' | 'ndjson';
  compression?: 'gzip' | 'none';
  headers: Record<string, string>;
  secret?: unknown;
}

export interface OtlpHttpDelivery {
  type: 'otlphttp';
  endpoint: { traces: string };
  encoding: 'json' | 'proto';
  headers: Record<string, string>;
  secret?: unknown;
}

/** Other destinations (s3, integrations) pass through unchanged. */
export interface OtherDelivery {
  type: string;
  endpoint?: unknown;
  encoding?: string;
  headers?: Record<string, string>;
  secret?: unknown;
  [key: string]: unknown;
}

export type DrainDelivery = HttpDelivery | OtlpHttpDelivery | OtherDelivery;

export interface BasicDrainFilter {
  type: 'basic';
  project?: { ids: string[] };
  log?: { sources?: string[]; [key: string]: unknown };
  deployment?: { environments: string[] };
}

export interface DrainFilter {
  version: 'v2';
  filter: BasicDrainFilter | { type: 'odata'; text: string };
}

export interface HeadSamplingRule {
  type: 'head_sampling';
  rate: number;
  env?: string;
  requestPath?: string;
}

/**
 * Delivery health over the last 24 hours. The API only returns it with
 * `includeDeliveryStats=true`, and only for teams with drain delivery metrics.
 */
export interface DrainDeliveryStats {
  state: 'healthy' | 'failing' | 'unknown';
  failures: number;
  attempts: number;
  window: string;
}

export interface Drain {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  projectIds?: string[];
  schemas: Record<string, { version: string }>;
  delivery?: DrainDelivery;
  sampling?: HeadSamplingRule[];
  status?: 'enabled' | 'disabled' | 'errored';
  disabledAt?: number;
  disabledReason?: string;
  source?: { kind: string; [key: string]: unknown };
  filterV2?: DrainFilter;
  deliveryStats?: DrainDeliveryStats;
  [key: string]: unknown;
}

export interface CreateDrainBody {
  name: string;
  projects: 'all' | 'some';
  projectIds?: string[];
  schemas: Record<string, { version: string }>;
  delivery: HttpDelivery | OtlpHttpDelivery;
  sampling?: HeadSamplingRule[];
  filter?: DrainFilter;
  source: { kind: 'self-served' };
}

export interface UpdateDrainBody {
  name?: string;
  projects?: 'all' | 'some';
  projectIds?: string[];
  delivery?: DrainDelivery;
  sampling?: HeadSamplingRule[] | null;
  filter?: DrainFilter | null;
  status?: 'enabled' | 'disabled';
}

export interface DrainList {
  drains: Drain[];
  /**
   * False when the team doesn't have delivery stats, or the API couldn't
   * compute them for this request.
   */
  hasDeliveryStats: boolean;
  /** True when the API failed to compute the stats it would have returned. */
  deliveryStatsUnavailable: boolean;
}

function drainPath(id: string) {
  return `/v1/drains/${encodeURIComponent(id)}`;
}

/**
 * Lists the team's drains and asks for their delivery stats. Teams without
 * drain delivery metrics get the drains without stats, and a failed stats
 * query is retried once without them, so the list itself never fails because
 * of the stats.
 */
export async function listDrains(
  client: Client,
  opts: { project?: string } = {}
): Promise<DrainList> {
  const query = new URLSearchParams();
  if (opts.project) query.set('projectId', opts.project);

  const withStats = new URLSearchParams(query);
  withStats.set('includeDeliveryStats', 'true');
  try {
    const { drains } = await client.fetch<{ drains: Drain[] }>(
      `/v1/drains?${withStats}`,
      { retry: { retries: 0 } }
    );
    return {
      drains,
      hasDeliveryStats: drains.some(drain => drain.deliveryStats),
      deliveryStatsUnavailable: false,
    };
  } catch (err) {
    if (
      !isAPIError(err) ||
      err.status !== 503 ||
      err.code !== 'delivery_stats_unavailable'
    ) {
      throw err;
    }
  }

  const suffix = opts.project ? `?${query}` : '';
  const { drains } = await client.fetch<{ drains: Drain[] }>(
    `/v1/drains${suffix}`
  );
  return { drains, hasDeliveryStats: false, deliveryStatsUnavailable: true };
}

export function getDrain(client: Client, id: string): Promise<Drain> {
  return client.fetch<Drain>(drainPath(id));
}

/**
 * Creating a drain isn't idempotent, so a failed request is never retried: a
 * retry after a lost response would create a second drain.
 */
export function createDrain(
  client: Client,
  body: CreateDrainBody
): Promise<Drain> {
  return client.fetch<Drain>('/v1/drains', {
    method: 'POST',
    body: body as unknown as JSONObject,
    retry: { retries: 0 },
  });
}

export function updateDrain(
  client: Client,
  id: string,
  body: UpdateDrainBody
): Promise<Drain> {
  return client.fetch<Drain>(drainPath(id), {
    method: 'PATCH',
    body: body as unknown as JSONObject,
  });
}

export async function deleteDrain(client: Client, id: string): Promise<void> {
  await client.fetch(drainPath(id), { method: 'DELETE' });
}
