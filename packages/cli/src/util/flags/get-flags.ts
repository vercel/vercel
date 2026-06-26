import type Client from '../client';
import type { Flag, FlagsListResponse, FlagSettings } from './types';
import output from '../../output-manager';

export interface GetFlagsOptions {
  state?: 'active' | 'archived';
  tags?: string[];
  createdBy?: string;
  maintainerIds?: string[];
}

export async function getFlags(
  client: Client,
  projectId: string,
  options: GetFlagsOptions = {}
): Promise<Flag[]> {
  const { state = 'active', tags, createdBy, maintainerIds } = options;
  output.debug(`Fetching feature flags for project ${projectId}`);

  const basePath = `/v2/projects/${encodeURIComponent(projectId)}/feature-flags/flags`;
  const flags: Flag[] = [];
  let cursor: string | undefined;

  // The v2 endpoint paginates (default 25 per page), so follow cursors to
  // gather the full list and preserve the previous "list everything" behavior.
  do {
    const query = new URLSearchParams();
    query.set('state', state);
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
  } while (cursor);

  return flags;
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
