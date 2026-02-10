import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { Flag, CreateFlagRequest } from './types';
import output from '../../output-manager';

export async function createFlag(
  client: Client,
  projectId: string,
  request: CreateFlagRequest
): Promise<Flag> {
  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags`;

  output.debug(
    `Creating feature flag ${request.slug} for project ${projectId}`
  );
  output.debug(`API endpoint: PUT ${url}`);
  output.debug(`Request body: ${JSON.stringify(request, null, 2)}`);

  try {
    const response = await client.fetch<Flag>(url, {
      method: 'PUT',
      body: request as unknown as JSONObject,
    });

    output.debug(`Response: ${JSON.stringify(response, null, 2)}`);
    return response;
  } catch (err: unknown) {
    output.debug(`API error occurred`);
    if (err instanceof Error) {
      output.debug(`Error message: ${err.message}`);
      output.debug(`Error name: ${err.name}`);
      output.debug(`Error stack: ${err.stack}`);
      // Check if it has additional properties (like response body)
      const errWithBody = err as Error & { body?: unknown; status?: number };
      if (errWithBody.status) {
        output.debug(`Error status: ${errWithBody.status}`);
      }
      if (errWithBody.body) {
        output.debug(
          `Error body: ${JSON.stringify(errWithBody.body, null, 2)}`
        );
      }
    }
    throw err;
  }
}
