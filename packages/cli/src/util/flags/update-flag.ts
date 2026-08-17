import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { Flag, UpdateFlagRequest } from './types';
import output from '../../output-manager';

export interface FetchFlagForUpdateResult {
  flag: Flag;
  etag: string;
}

export function flagUrl(projectId: string, flagIdOrSlug: string): string {
  return `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags/${encodeURIComponent(flagIdOrSlug)}`;
}

export async function fetchFlagForUpdate(
  client: Client,
  projectId: string,
  flagIdOrSlug: string
): Promise<FetchFlagForUpdateResult> {
  output.debug(
    `Fetching feature flag ${flagIdOrSlug} for project ${projectId} with ETag`
  );

  const response = await client.fetch(flagUrl(projectId, flagIdOrSlug), {
    json: false,
  });
  const etag = response.headers.get('etag');

  if (!etag) {
    throw new Error(
      'Unable to update flag safely because the flag ETag is missing.'
    );
  }

  return {
    flag: (await response.json()) as Flag,
    etag,
  };
}

export async function updateFlag(
  client: Client,
  projectId: string,
  flagIdOrSlug: string,
  request: UpdateFlagRequest,
  options?: {
    ifMatch?: string;
  }
): Promise<Flag> {
  output.debug(
    `Updating feature flag ${flagIdOrSlug} for project ${projectId}`
  );

  const url = flagUrl(projectId, flagIdOrSlug);
  const response = await client.fetch<Flag>(url, {
    method: 'PATCH',
    headers: options?.ifMatch ? { 'If-Match': options.ifMatch } : undefined,
    body: request as unknown as JSONObject,
  });

  return response;
}
