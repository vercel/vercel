import ms from 'ms';
import type Client from './client';

export interface RequestLogMessage {
  level: string;
  message: string;
  messageTruncated?: boolean;
}

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
  logs: RequestLogMessage[];
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
  requestId?: string;
  branch?: string;
  page?: number;
}

type DisplayLogLevel = RequestLogEntry['level'];

const LOG_LEVEL_SEVERITY: Record<
  'info' | 'warning' | 'error' | 'fatal',
  number
> = {
  info: 0,
  warning: 1,
  error: 2,
  fatal: 3,
};

function getLogLevelSeverity(level: string): number {
  return LOG_LEVEL_SEVERITY[level as keyof typeof LOG_LEVEL_SEVERITY] ?? -1;
}

function getDisplayLog(
  logs: RequestLogMessage[],
  requestedLevels?: string[]
): RequestLogMessage | undefined {
  if (logs.length === 0) {
    return undefined;
  }

  const matchingLogs =
    requestedLevels && requestedLevels.length > 0
      ? logs.filter(log => requestedLevels.includes(log.level))
      : logs;

  const candidates = matchingLogs.length > 0 ? matchingLogs : logs;

  return candidates.reduce((selected, current) =>
    getLogLevelSeverity(current.level) > getLogLevelSeverity(selected.level)
      ? current
      : selected
  );
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
    requestId,
    branch,
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
    query.set('statusCode', statusCode);
  }

  if (source && source.length > 0) {
    query.set('source', source.join(','));
  }
  // Don't set a default source filter - let the API return all sources

  if (search) {
    query.set('search', search);
  }

  if (requestId) {
    query.set('requestId', requestId);
  }

  if (branch) {
    query.set('branch', branch);
  }

  // The request-logs API is on vercel.com, not api.vercel.com
  // In tests, client.apiUrl points to the mock server, so use that
  const baseUrl =
    client.apiUrl === 'https://api.vercel.com'
      ? 'https://vercel.com'
      : client.apiUrl;
  const url = `${baseUrl}/api/logs/request-logs?${query.toString()}`;

  interface ApiLogEntry {
    requestId?: string;
    timestamp?: string;
    deploymentId?: string;
    requestMethod?: string;
    requestPath?: string;
    statusCode?: number;
    environment?: string;
    branch?: string;
    cache?: string;
    traceId?: string;
    logs?: Array<{
      level?: string;
      message?: string;
      messageTruncated?: boolean;
    }>;
    events?: Array<{ source?: string }>;
    domain?: string;
  }

  const data = await client.fetch<{
    rows?: ApiLogEntry[];
    hasMoreRows?: boolean;
  }>(url);

  const logs: RequestLogEntry[] = (data.rows || []).map(row => {
    const requestLogs: RequestLogMessage[] = (row.logs || []).map(log => ({
      level: log.level || 'info',
      message: log.message || '',
      messageTruncated: log.messageTruncated,
    }));
    const displayLog = getDisplayLog(requestLogs, options.level);
    const firstEvent = row.events?.[0];
    return {
      id: row.requestId || '',
      timestamp: row.timestamp ? new Date(row.timestamp).getTime() : Date.now(),
      deploymentId: row.deploymentId || '',
      projectId: options.projectId,
      level: (displayLog?.level as DisplayLogLevel) || 'info',
      message: displayLog?.message || '',
      messageTruncated: displayLog?.messageTruncated,
      source: (firstEvent?.source as RequestLogEntry['source']) || 'static',
      domain: row.domain || '',
      requestMethod: row.requestMethod || '',
      requestPath: row.requestPath || '',
      responseStatusCode: row.statusCode || 0,
      environment:
        (row.environment as RequestLogEntry['environment']) || 'production',
      branch: row.branch,
      cache: row.cache,
      traceId: row.traceId,
      logs: requestLogs,
    };
  });

  return {
    logs,
    pagination: {
      hasMore: data.hasMoreRows ?? false,
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
