import type { JSONArray, Team } from '@vercel-internals/types';
import type Client from '../client';

/**
 * One deployment-policy rule list: a JSON array of rule objects, or `null`
 * to clear all rules of that type. The CLI validates that each entry is an
 * object with `enabled`, `environments`, and `sources`; rule internals are
 * validated by the API.
 */
export type DeploymentPolicyRules = JSONArray | null;

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
  requireVerifiedCommits?: boolean;
  sensitiveEnvironmentVariablePolicy?: string;
  hideIpAddresses?: boolean;
  deploymentPolicy?: {
    gitSources?: DeploymentPolicyRules;
    deploymentSources?: DeploymentPolicyRules;
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
