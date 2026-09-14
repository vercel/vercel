import output from '../../output-manager';
import type Client from '../client';
import type { StaleFlag, StaleFlagsResponse } from './types';

export const DEFAULT_STALE_FLAGS_LIMIT = 50;
export const MAX_STALE_FLAGS_LIMIT = 100;
export const DEFAULT_STALE_AFTER = '30d';
export const MAX_STALE_AFTER_DAYS = 90;

export interface GetStaleFlagsOptions {
  staleAfter?: string;
  limit?: number;
  cursor?: string;
}

export interface GetStaleFlagsResult {
  flags: StaleFlag[];
  next: string | null;
}

export async function getStaleFlags(
  client: Client,
  projectId: string,
  options: GetStaleFlagsOptions = {}
): Promise<GetStaleFlagsResult> {
  const {
    staleAfter = DEFAULT_STALE_AFTER,
    limit = DEFAULT_STALE_FLAGS_LIMIT,
    cursor,
  } = options;
  output.debug(`Fetching stale feature flags for project ${projectId}`);

  const query = new URLSearchParams();
  query.set('staleAfter', staleAfter);
  query.set('limit', String(limit));
  if (cursor) {
    query.set('cursor', cursor);
  }

  const response = await client.fetch<StaleFlagsResponse>(
    `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/stale-flags?${query}`
  );

  return { flags: response.data, next: response.pagination.next };
}
