import type Client from '../client';
import type { Flag, FlagsListResponse } from './types';
import output from '../../output-manager';

export async function getFlags(
  client: Client,
  projectId: string,
  state: 'active' | 'archived' = 'active'
): Promise<Flag[]> {
  output.debug(`Fetching feature flags for project ${projectId}`);

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags?state=${state}`;
  const response = await client.fetch<FlagsListResponse>(url);

  return response.data;
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
