import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { Flag, CreateFlagRequest } from './types';
import output from '../../output-manager';

export async function createFlag(
  client: Client,
  projectId: string,
  request: CreateFlagRequest
): Promise<Flag> {
  output.debug(
    `Creating feature flag ${request.slug} for project ${projectId}`
  );

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags`;
  const response = await client.fetch<Flag>(url, {
    method: 'PUT',
    body: request as unknown as JSONObject,
  });

  return response;
}
