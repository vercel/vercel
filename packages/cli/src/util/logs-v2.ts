import ms from 'ms';
import fetch from 'node-fetch';
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
    page?: number;
    hasMore?: boolean;
  };
}

export interface FetchRequestLogsOptions {
  projectId: string;
  ownerId: string;
  deploymentId?: string;
  environment?: string;
  level?: string[];
  statusCode?: string;
  source?: string[];
  since?: string;
  until?: string;
  limit?: number;
  search?: string;
  page?: number;
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
    ownerId,
    deploymentId,
    environment,
    level,
    statusCode,
    source,
    since,
    until,
    search,
    page = 0,
  } = options;

  const now = Date.now();
  const defaultStartDate = now - 24 * 60 * 60 * 1000; // 24 hours ago

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  query.set('ownerId', ownerId);
  query.set('page', String(page));
  query.set(
    'startDate',
    String(since ? parseRelativeTime(since) : defaultStartDate)
  );
  query.set('endDate', String(until ? parseRelativeTime(until) : now));

  if (deploymentId) {
    query.set('deploymentId', deploymentId);
  }

  if (environment) {
    query.set('environment', environment);
  }

  if (level && level.length > 0) {
    query.set('level', level.join(','));
  }

  if (statusCode) {
    query.set('statusCode', formatStatusCodeFilter(statusCode));
  }

  if (source && source.length > 0) {
    query.set('source', source.join(','));
  } else {
    // Default sources matching the dashboard
    query.set('source', 'serverless,middleware,cache');
  }

  if (search) {
    query.set('search', search);
  }

  const url = `https://vercel.com/api/logs/request-logs?${query.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${client.authConfig.token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch logs: ${response.status} ${error}`);
  }

  const data = await response.json();

  // Normalize the response - API returns 'rows' and 'hasMoreRows'
  const apiData = data as { rows?: RequestLogEntry[]; hasMoreRows?: boolean };
  return {
    logs: apiData.rows || [],
    pagination: {
      hasMore: apiData.hasMoreRows ?? false,
    },
  };
}

export async function* fetchAllRequestLogs(
  client: Client,
  options: FetchRequestLogsOptions
): AsyncGenerator<RequestLogEntry> {
  let page = 0;
  let remaining = options.limit ?? 100;
  let hasMore = true;

  while (hasMore && remaining > 0) {
    const response = await fetchRequestLogs(client, {
      ...options,
      page,
    });

    if (!response.logs || response.logs.length === 0) {
      break;
    }

    for (const log of response.logs) {
      yield log;
      remaining--;
      if (remaining <= 0) {
        return;
      }
    }

    hasMore = response.pagination?.hasMore ?? false;
    page++;
  }
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
