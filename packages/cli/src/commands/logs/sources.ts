/**
 * Data sources of `vercel logs`, shared by help, queries, and rendering.
 *
 * Field references document common public API fields for `--query`. They are
 * not an allowlist: the API validates every field, so newly supported fields
 * work without a CLI release.
 */

export type LogsSourceName = 'runtime' | 'requests';

export interface FilterField {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly example: string;
}

export interface LogsSource {
  readonly name: LogsSourceName;
  /** Canonical observability API event name. */
  readonly event: 'vercel.log' | 'vercel.proxy_response';
  /** Public event fields to return; `timestamp` is always returned. */
  readonly select: ReadonlyArray<string>;
  readonly queryReason: string;
  /** Predicates that always narrow this source, such as the CDN exclusion. */
  readonly fixedFilters: ReadonlyArray<string>;
  /**
   * Round time bounds down to whole seconds, matching the dashboard's query
   * window for this source. The API accepts millisecond bounds for both
   * sources; this keeps a CLI window aligned with the dashboard's.
   */
  readonly wholeSecondBounds: boolean;
  /** Plural noun for records of this source, e.g. "runtime log entries". */
  readonly recordsLabel: string;
  /** The JSONL `type` of a record line from this source. */
  readonly recordType: 'log' | 'request';
  readonly filterFields: ReadonlyArray<FilterField>;
}

const runtimeFilterFields: ReadonlyArray<FilterField> = [
  { name: 'level', type: 'string', example: 'level:error' },
  { name: 'source', type: 'string', example: 'source:function' },
  { name: 'environment', type: 'string', example: 'environment:production' },
  { name: 'deploymentId', type: 'string', example: 'deploymentId:dpl_xxxxx' },
  { name: 'requestId', type: 'string', example: 'requestId:"<request-id>"' },
  { name: 'domain', type: 'string', example: 'domain:my-app.vercel.app' },
  { name: 'requestPath', type: 'string', example: 'requestPath:*checkout*' },
  { name: 'requestMethod', type: 'string', example: 'requestMethod:POST' },
  { name: 'region', type: 'string', example: 'region:iad1' },
  { name: 'service', type: 'string', example: 'service:api' },
  {
    name: 'traceId',
    type: 'string',
    example: 'traceId:0123456789abcdef0123456789abcdef',
  },
  { name: 'spanId', type: 'string', example: 'spanId:0123456789abcdef' },
  { name: 'runtime', type: 'string', example: 'runtime:nodejs' },
  { name: 'stream', type: 'string', example: 'stream:stderr' },
  { name: 'isSystemLog', type: 'boolean', example: 'isSystemLog:false' },
  { name: 'truncated', type: 'boolean', example: 'truncated:true' },
];

const requestsFilterFields: ReadonlyArray<FilterField> = [
  { name: 'environment', type: 'string', example: 'environment:production' },
  { name: 'deploymentId', type: 'string', example: 'deploymentId:dpl_xxxxx' },
  { name: 'requestId', type: 'string', example: 'requestId:"<request-id>"' },
  {
    name: 'requestHostname',
    type: 'string',
    example: 'requestHostname:my-app.vercel.app',
  },
  { name: 'requestPath', type: 'string', example: 'requestPath:*checkout*' },
  { name: 'requestMethod', type: 'string', example: 'requestMethod:POST' },
  { name: 'httpStatus', type: 'number', example: 'httpStatus >= 500' },
  { name: 'route', type: 'string', example: 'route:/api/checkout' },
  { name: 'cacheResult', type: 'string', example: 'cacheResult:MISS' },
  {
    name: 'edgeNetworkRegion',
    type: 'string',
    example: 'edgeNetworkRegion:iad1',
  },
  { name: 'service', type: 'string', example: 'service:api' },
];

// Field selections match the dashboard's runtime log and CDN request queries.
// Runtime keeps `attributes`, `branch`, and `projectId` for diagnostic context.
export const runtimeSource: LogsSource = {
  name: 'runtime',
  event: 'vercel.log',
  select: [
    'projectId',
    'requestId',
    'branch',
    'deploymentId',
    'domain',
    'environment',
    'requestPath',
    'requestMethod',
    'source',
    'service',
    'isSystemLog',
    'region',
    'runtime',
    'level',
    'message',
    'stream',
    'traceId',
    'spanId',
    'attributes',
    'truncated',
  ],
  queryReason: 'cli/logs-runtime',
  fixedFilters: [],
  wholeSecondBounds: false,
  recordsLabel: 'runtime log entries',
  recordType: 'log',
  filterFields: runtimeFilterFields,
};

// The dashboard's CDN Requests view excludes background function executions.
export const BACKGROUND_FUNCTION_EXCLUSION = 'NOT pathType:"background_func"';

export const requestsSource: LogsSource = {
  name: 'requests',
  event: 'vercel.proxy_response',
  select: [
    'projectId',
    'requestId',
    'deploymentId',
    'environment',
    'requestHostname',
    'requestPath',
    'requestMethod',
    'httpStatus',
    'route',
    'pathType',
    'cacheResult',
    'edgeNetworkRegion',
    'service',
    'clientIpCountry',
    'clientUserAgent',
    'wafAction',
  ],
  queryReason: 'cli/logs-requests',
  fixedFilters: [BACKGROUND_FUNCTION_EXCLUSION],
  wholeSecondBounds: true,
  recordsLabel: 'CDN request records',
  recordType: 'request',
  filterFields: requestsFilterFields,
};

export const logsSources: Record<LogsSourceName, LogsSource> = {
  runtime: runtimeSource,
  requests: requestsSource,
};

/** The data source that queries `event`, if any. */
export function sourceForEvent(event: string): LogsSource | undefined {
  return Object.values(logsSources).find(source => source.event === event);
}

/** Wraps a list of names into lines no wider than `width`. */
export function wrapFieldNames(
  names: ReadonlyArray<string>,
  width: number
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const name of names) {
    const next = line ? `${line}, ${name}` : name;
    if (line && next.length + 1 > width) {
      lines.push(`${line},`);
      line = name;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A FIELD / TYPE / EXAMPLE table for a source's help. */
export function filterFieldTable(source: LogsSource): string[] {
  const nameWidth = Math.max(
    'FIELD'.length,
    ...source.filterFields.map(field => field.name.length)
  );
  const typeWidth = Math.max(
    'TYPE'.length,
    ...source.filterFields.map(field => field.type.length)
  );
  const row = (name: string, type: string, example: string) =>
    `${name.padEnd(nameWidth)}  ${type.padEnd(typeWidth)}  ${example}`;
  return [
    row('FIELD', 'TYPE', 'EXAMPLE'),
    ...source.filterFields.map(field =>
      row(field.name, field.type, field.example)
    ),
  ];
}
