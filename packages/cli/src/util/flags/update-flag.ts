import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { Flag, UpdateFlagRequest } from './types';
import output from '../../output-manager';

export async function updateFlag(
  client: Client,
  projectId: string,
  flagIdOrSlug: string,
  request: UpdateFlagRequest
): Promise<Flag> {
  output.debug(
    `Updating feature flag ${flagIdOrSlug} for project ${projectId}`
  );

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags/${encodeURIComponent(flagIdOrSlug)}`;
  const response = await client.fetch<Flag>(url, {
    method: 'PATCH',
    body: request as unknown as JSONObject,
  });

  return response;
}
