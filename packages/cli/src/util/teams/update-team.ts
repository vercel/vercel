import type { Team } from '@vercel-internals/types';
import type Client from '../client';

/**
 * Sparse PATCH payload for `PATCH /teams/:id`. Only fields explicitly set by
 * the caller are sent; the endpoint leaves omitted fields untouched.
 */
export type TeamUpdatePayload = {
  name?: string;
  slug?: string;
  previewDeploymentSuffix?: string | null;
  enablePreviewFeedback?: string;
  resourceConfig?: {
    buildMachine: {
      default: string;
    };
  };
};

export default async function updateTeam(
  client: Client,
  teamId: string,
  payload: TeamUpdatePayload
): Promise<Team> {
  const body = await client.fetch<Team>(
    `/teams/${encodeURIComponent(teamId)}`,
    {
      method: 'PATCH',
      body: payload,
    }
  );
  // fetch() returns a Response when the body is not application/json; PATCH
  // /teams should always return the updated Team as JSON.
  if (body && typeof body === 'object' && 'ok' in body) {
    throw new Error('PATCH /teams returned a non-JSON response');
  }
  return body as Team;
}
