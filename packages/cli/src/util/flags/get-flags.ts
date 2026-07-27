import type Client from '../client';
import type {
  Flag,
  FlagsListResponse,
  FlagSettings,
  FlagVersion,
  FlagVersionsResponse,
} from './types';
import output from '../../output-manager';

export interface GetFlagsOptions {
  state?: 'active' | 'archived';
  tags?: string[];
  createdBy?: string;
  maintainerIds?: string[];
  /**
   * Page size. When set (or when `cursor` is provided), a single page is
   * returned and `next` exposes the cursor to resume from. When omitted, all
   * flags are fetched by following pagination cursors.
   */
  limit?: number;
  /**
   * Resume from a `next` cursor returned by a previous call. Unlike the repo's
   * usual timestamp-based `--next`, the v2 endpoint is cursor-based, so we
   * follow `pagination.next` cursors here instead of using `fetchPaginated`.
   */
  cursor?: string;
}

export interface GetFlagsResult {
  flags: Flag[];
  next: string | null;
}

export interface GetFlagVersionsOptions {
  environment?: string;
  limit?: number;
  cursor?: string;
}

export interface GetFlagVersionsResult {
  versions: FlagVersion[];
  next: string | null;
}

// The v2 endpoint caps the page size at 100, so request that much when
// fetching the full list to minimize round-trips.
export const MAX_FLAGS_PAGE_LIMIT = 100;
export const MAX_FLAG_VERSIONS_PAGE_LIMIT = 100;

export async function getFlags(
  client: Client,
  projectId: string,
  options: GetFlagsOptions = {}
): Promise<GetFlagsResult> {
  const {
    state = 'active',
    tags,
    createdBy,
    maintainerIds,
    limit,
    cursor,
  } = options;
  output.debug(`Fetching feature flags for project ${projectId}`);

  const basePath = `/v2/projects/${encodeURIComponent(projectId)}/feature-flags/flags`;

  const buildQuery = (pageLimit: number, pageCursor?: string) => {
    const query = new URLSearchParams();
    query.set('state', state);
    query.set('limit', String(pageLimit));
    if (pageCursor) {
      query.set('cursor', pageCursor);
    }
    if (createdBy) {
      query.set('createdBy', createdBy);
    }
    for (const tag of tags ?? []) {
      query.append('tags', tag);
    }
    for (const maintainerId of maintainerIds ?? []) {
      query.append('maintainerIds', maintainerId);
    }
    return query.toString();
  };

  // Paging mode: return a single page and surface the cursor to resume from.
  if (limit !== undefined || cursor !== undefined) {
    const pageLimit = Math.min(
      limit ?? MAX_FLAGS_PAGE_LIMIT,
      MAX_FLAGS_PAGE_LIMIT
    );
    const response = await client.fetch<FlagsListResponse>(
      `${basePath}?${buildQuery(pageLimit, cursor)}`
    );
    return { flags: response.data, next: response.pagination?.next ?? null };
  }

  // Otherwise follow `pagination.next` cursors to gather the full list.
  const flags: Flag[] = [];
  let pageCursor: string | undefined;
  do {
    const response = await client.fetch<FlagsListResponse>(
      `${basePath}?${buildQuery(MAX_FLAGS_PAGE_LIMIT, pageCursor)}`
    );
    flags.push(...response.data);
    pageCursor = response.pagination?.next ?? undefined;
  } while (pageCursor);

  return { flags, next: null };
}

export async function getFlag(
  client: Client,
  projectId: string,
  flagIdOrSlug: string
): Promise<Flag> {
  output.debug(
    `Fetching feature flag ${flagIdOrSlug} for project ${projectId}`
  );

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags/${encodeURIComponent(flagIdOrSlug)}`;
  const response = await client.fetch<Flag>(url);

  return response;
}

export async function getFlagSettings(
  client: Client,
  projectId: string
): Promise<FlagSettings> {
  output.debug(`Fetching feature flag settings for project ${projectId}`);

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/settings`;
  const response = await client.fetch<FlagSettings>(url);

  return response;
}

export async function getFlagVersions(
  client: Client,
  projectId: string,
  flagIdOrSlug: string,
  options: GetFlagVersionsOptions = {}
): Promise<GetFlagVersionsResult> {
  output.debug(
    `Fetching feature flag versions for ${flagIdOrSlug} in project ${projectId}`
  );

  const query = new URLSearchParams();
  query.set('withMetadata', 'true');
  if (options.environment) {
    query.set('environment', options.environment);
  }
  if (options.limit !== undefined) {
    query.set('limit', String(options.limit));
  }
  if (options.cursor) {
    query.set('cursor', options.cursor);
  }

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags/${encodeURIComponent(flagIdOrSlug)}/versions?${query.toString()}`;
  const response = await client.fetch<FlagVersionsResponse>(url);
  const next =
    response.pagination?.next ??
    (response.pagination?.hasNext ? response.pagination.cursor : null) ??
    null;

  return {
    versions: response.versions,
    next,
  };
}
