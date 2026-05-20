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
