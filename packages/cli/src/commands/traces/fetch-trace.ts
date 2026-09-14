import type Client from '../../util/client';
import type { Trace } from './types';

const OBSERVABILITY_API_URL = 'https://vercel.com/api/observability-api/';
const QUERY_REASON_HEADER = 'x-vercel-observability-query-reason';
const QUERY_REASON = 'cli/traces-get';

export type FetchTraceParams = {
  client: Client;
  teamId: string;
  projectId: string;
  requestId: string;
};

export type FetchTraceSuccess = {
  trace: Trace;
  partial: boolean;
};

type ResolvedTraceResponse = {
  traceId?: unknown;
  rootSpanId?: unknown;
  spans?: unknown;
  meta?: {
    partial?: unknown;
  };
};

class QueryEngineResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryEngineResponseError';
  }
}

export async function fetchTrace({
  client,
  teamId,
  projectId,
  requestId,
}: FetchTraceParams): Promise<FetchTraceSuccess> {
  return fetchQueryEngineTrace({ client, teamId, projectId, requestId });
}

async function fetchQueryEngineTrace({
  client,
  teamId,
  projectId,
  requestId,
}: FetchTraceParams): Promise<FetchTraceSuccess> {
  const traceUrl = new URL(
    `v1/traces/requests/${encodeURIComponent(requestId)}`,
    OBSERVABILITY_API_URL
  );
  traceUrl.searchParams.set('teamId', teamId);
  traceUrl.searchParams.set('projectId', projectId);
  const response = await client.fetch<ResolvedTraceResponse>(traceUrl.href, {
    headers: { [QUERY_REASON_HEADER]: QUERY_REASON },
  });

  return {
    trace: mapTrace(response),
    partial: isRecord(response.meta) && response.meta.partial === true,
  };
}

function mapTrace(response: unknown): Trace {
  if (
    !isRecord(response) ||
    typeof response.traceId !== 'string' ||
    !Array.isArray(response.spans)
  ) {
    throw new QueryEngineResponseError(
      'Observability API returned an invalid resolved trace.'
    );
  }

  return {
    traceId: response.traceId,
    ...(typeof response.rootSpanId === 'string'
      ? { rootSpanId: response.rootSpanId }
      : {}),
    spans: response.spans.map(mapSpan),
  };
}

function mapSpan(value: unknown): Trace['spans'][number] {
  if (!isRecord(value) || typeof value.spanId !== 'string') {
    throw new QueryEngineResponseError(
      'Observability API returned an invalid trace span.'
    );
  }
  if (typeof value.name !== 'string' || typeof value.durationMs !== 'number') {
    throw new QueryEngineResponseError(
      'Observability API returned an invalid trace span.'
    );
  }

  const timestamp = parseTimestamp(value.timestamp);
  const attributes = isRecord(value.attributes) ? value.attributes : undefined;
  const status = isRecord(value.status) ? value.status : undefined;
  const statusCode = status?.code === 'ERROR' ? 1 : 0;
  const statusMessage =
    typeof status?.message === 'string' ? status.message : undefined;

  return {
    spanId: value.spanId,
    ...(typeof value.parentSpanId === 'string' && value.parentSpanId
      ? { parentSpanId: value.parentSpanId }
      : {}),
    name: value.name,
    duration: durationTuple(value.durationMs),
    startTime: timestampTuple(timestamp),
    ...(attributes ? { attributes } : {}),
    status: {
      code: statusCode,
      ...(statusMessage ? { message: statusMessage } : {}),
    },
  };
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string') {
    throw new QueryEngineResponseError(
      'Observability API returned an invalid trace timestamp.'
    );
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new QueryEngineResponseError(
      'Observability API returned an invalid trace timestamp.'
    );
  }
  return timestamp;
}

function durationTuple(durationMs: number): [number, number] {
  const nanoseconds = Math.round(durationMs * 1_000_000);
  if (!Number.isSafeInteger(nanoseconds) || nanoseconds < 0) {
    throw new QueryEngineResponseError(
      'Observability API returned an invalid span duration.'
    );
  }
  return [Math.floor(nanoseconds / 1_000_000_000), nanoseconds % 1_000_000_000];
}

function timestampTuple(timestampMs: number): [number, number] {
  const seconds = Math.floor(timestampMs / 1_000);
  return [seconds, (timestampMs - seconds * 1_000) * 1_000_000];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
