import { URLSearchParams } from 'url';
import type Client from '../client';
import output from '../../output-manager';

export type SharedEnvType = 'encrypted' | 'sensitive';
export type SharedEnvTarget = 'production' | 'preview' | 'development';

/**
 * A team-scoped Shared Environment Variable, as returned by the public
 * `/v1/env` endpoints. The decrypted `value` is only ever populated by the
 * get-by-id endpoint; the CLI never prints it.
 */
export interface SharedEnvVariable {
  id: string;
  key?: string;
  ownerId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  deletedBy?: string | null;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
  projectId?: string[];
  type?: SharedEnvType;
  target?: SharedEnvTarget[];
  applyToAllCustomEnvironments?: boolean;
  customEnvironmentIds?: string[];
  decrypted?: boolean;
  comment?: string;
  lastEditedByDisplayName?: string;
  value?: string;
}

export interface SharedEnvPagination {
  count: number;
  next: number | null;
  prev: number | null;
}

interface ListSharedEnvResponse {
  data: SharedEnvVariable[];
  pagination: SharedEnvPagination;
}

export interface GetSharedEnvRecordsOptions {
  /** Filter to variables linked to a specific project (id or name). */
  projectId?: string;
  /** Free-text search over variable names. */
  search?: string;
  /** Filter to a comma-separated list of variable ids. */
  ids?: string;
  /** Page size. */
  limit?: number;
  /** Pagination cursor: the `createdAt` timestamp to page before. */
  next?: number;
}

/**
 * Lists team Shared Environment Variables. Values are never returned by this
 * endpoint, so the CLI can safely display the metadata it returns.
 */
export default async function getSharedEnvRecords(
  client: Client,
  { projectId, search, ids, limit, next }: GetSharedEnvRecordsOptions = {}
): Promise<ListSharedEnvResponse> {
  output.debug('Fetching team Shared Environment Variables');

  const query = new URLSearchParams();
  if (projectId) {
    query.set('projectId', projectId);
  }
  if (search) {
    query.set('search', search);
  }
  if (ids) {
    query.set('ids', ids);
  }
  if (typeof limit === 'number') {
    query.set('limit', String(limit));
  }
  if (typeof next === 'number') {
    query.set('until', String(next));
  }

  const queryString = query.toString();
  const url = `/v1/env${queryString ? `?${queryString}` : ''}`;

  return client.fetch<ListSharedEnvResponse>(url);
}
