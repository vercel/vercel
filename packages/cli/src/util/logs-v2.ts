import ms from 'ms';
import type Client from './client';

export interface RequestLogEntry {
  id: string;
  timestamp: number;
  deploymentId: string;
  projectId: string;
  level: 'error' | 'warning' | 'info' | 'fatal';
  message: string;
  source: 'serverless' | 'edge-function' | 'edge-middleware' | 'static';
  domain: string;
  requestMethod: string;
  requestPath: string;
  responseStatusCode: number;
  environment: 'production' | 'preview';
  branch?: string;
  cache?: string;
  traceId?: string;
  messageTruncated?: boolean;
}

export interface RequestLogsResponse {
  logs: RequestLogEntry[];
  pagination?: {
    next?: string;
    hasMore?: boolean;
  };
}

export interface FetchRequestLogsOptions {
  projectId: string;
  deploymentId?: string;
  environment?: string;
  level?: string[];
  statusCode?: string;
  source?: string[];
  since?: string;
  until?: string;
  limit?: number;
  search?: string;
  cursor?: string;
}

function parseRelativeTime(input: string): number {
  const now = Date.now();
  const msValue = ms(input);
  if (typeof msValue === 'number') {
    return now - msValue;
  }
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }
  throw new Error(`Invalid time format: ${input}`);
}

function formatStatusCodeFilter(statusCode: string): string {
  if (statusCode.endsWith('xx')) {
    return statusCode;
  }
  return statusCode;
}

export async function fetchRequestLogs(
  client: Client,
  options: FetchRequestLogsOptions
): Promise<RequestLogsResponse> {
  const {
    projectId,
    deploymentId,
    environment,
    level,
    statusCode,
    source,
    since,
    until,
    limit = 100,
    search,
    cursor,
  } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  query.set('limit', String(limit));

  if (deploymentId) {
    query.set('deploymentId', deploymentId);
  }

  if (environment) {
    query.set('environment', environment);
  }

  if (level && level.length > 0) {
    for (const l of level) {
      query.append('level', l);
    }
  }

  if (statusCode) {
    query.set('statusCode', formatStatusCodeFilter(statusCode));
  }

  if (source && source.length > 0) {
    for (const s of source) {
      query.append('source', s);
    }
  }

  if (since) {
    const sinceMs = parseRelativeTime(since);
    query.set('since', String(sinceMs));
  }

  if (until) {
    const untilMs = parseRelativeTime(until);
    query.set('until', String(untilMs));
  }

  if (search) {
    query.set('search', search);
  }

  if (cursor) {
    query.set('cursor', cursor);
  }

  const url = `/api/logs/request-logs?${query.toString()}`;

  return client.fetch<RequestLogsResponse>(url);
}

export async function* fetchAllRequestLogs(
  client: Client,
  options: FetchRequestLogsOptions
): AsyncGenerator<RequestLogEntry> {
  let cursor: string | undefined;
  let remaining = options.limit ?? 100;

  do {
    const batchLimit = Math.min(remaining, 100);
    const response = await fetchRequestLogs(client, {
      ...options,
      limit: batchLimit,
      cursor,
    });

    for (const log of response.logs) {
      yield log;
      remaining--;
      if (remaining <= 0) {
        return;
      }
    }

    cursor = response.pagination?.next;
  } while (cursor && remaining > 0);
}

export async function resolveDeploymentId(
  client: Client,
  deploymentIdOrUrl: string
): Promise<string> {
  if (
    deploymentIdOrUrl.startsWith('dpl_') ||
    !deploymentIdOrUrl.includes('.')
  ) {
    return deploymentIdOrUrl;
  }

  try {
    const url = new URL(
      deploymentIdOrUrl.startsWith('http')
        ? deploymentIdOrUrl
        : `https://${deploymentIdOrUrl}`
    );
    const hostname = url.hostname;

    const deployment = await client.fetch<{ id: string }>(
      `/v13/deployments/get?url=${encodeURIComponent(hostname)}`
    );
    return deployment.id;
  } catch {
    return deploymentIdOrUrl;
  }
}
