import type Client from '../../util/client';
import type { Trace } from './types';

export type FetchTraceParams = {
  client: Client;
  teamId: string;
  projectId: string;
  requestId: string;
};

export type FetchTraceSuccess = {
  trace: Trace;
};

type GetTraceResponse = {
  trace: Trace;
};

/**
 * Fetch a captured trace by request id. Relies on `client.fetch`'s built-in
 * retry (5xx and network errors are retried; 4xx — including the 404 the
 * platform returns while the trace is still propagating to storage —
 * propagates to the caller).
 */
export async function fetchTrace({
  client,
  teamId,
  projectId,
  requestId,
}: FetchTraceParams): Promise<FetchTraceSuccess> {
  const search = new URLSearchParams({ teamId, projectId, requestId });
  const url = `/v1/projects/traces?${search.toString()}`;

  const response = await client.fetch<GetTraceResponse>(url);
  return { trace: response.trace };
}
