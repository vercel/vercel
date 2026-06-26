import type Client from '../client';
import type { Flag, FlagsListResponse, FlagSettings } from './types';
import output from '../../output-manager';

export interface GetFlagsOptions {
  state?: 'active' | 'archived';
  tags?: string[];
  createdBy?: string;
  maintainerIds?: string[];
  /**
   * Maximum number of flags to return. When omitted, all flags are fetched by
   * following pagination cursors.
   */
  limit?: number;
}

// The v2 endpoint paginates with a small default page size, so request the
// maximum allowed per page to minimize round-trips.
const MAX_PAGE_LIMIT = 100;

export async function getFlags(
  client: Client,
  projectId: string,
  options: GetFlagsOptions = {}
): Promise<Flag[]> {
  const { state = 'active', tags, createdBy, maintainerIds, limit } = options;
  output.debug(`Fetching feature flags for project ${projectId}`);

  const basePath = `/v2/projects/${encodeURIComponent(projectId)}/feature-flags/flags`;
  const flags: Flag[] = [];
  let cursor: string | undefined;

  // Follow `pagination.next` cursors to gather the requested flags. Without a
  // limit this lists everything; with a limit we stop once we have enough.
  do {
    const pageLimit =
      limit === undefined
        ? MAX_PAGE_LIMIT
        : Math.min(MAX_PAGE_LIMIT, limit - flags.length);

    const query = new URLSearchParams();
    query.set('state', state);
    query.set('limit', String(pageLimit));
    if (cursor) {
      query.set('cursor', cursor);
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

    const response = await client.fetch<FlagsListResponse>(
      `${basePath}?${query.toString()}`
    );
    flags.push(...response.data);
    cursor = response.pagination?.next ?? undefined;

    if (limit !== undefined && flags.length >= limit) {
      break;
    }
  } while (cursor);

  return limit === undefined ? flags : flags.slice(0, limit);
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
