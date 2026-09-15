import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { ProjectGrantPolicy } from './types';
import { PROJECT_GRANT_POLICY_KIND } from './types';

function policiesPath(issuerId: string): string {
  return `/v1/kms/issuers/${encodeURIComponent(issuerId)}/policies`;
}

/** Project grants are keyed by project ID. */
function projectGrantPath(issuerId: string, projectId: string): string {
  return `${policiesPath(issuerId)}/${PROJECT_GRANT_POLICY_KIND}/${encodeURIComponent(
    projectId
  )}`;
}

export type CreateProjectGrantPayload = {
  projectId: string;
  environments: string[];
  tokenClaims?: JSONObject;
};

export async function createProjectGrant(
  client: Client,
  issuerId: string,
  payload: CreateProjectGrantPayload
): Promise<ProjectGrantPolicy> {
  return client.fetch<ProjectGrantPolicy>(policiesPath(issuerId), {
    method: 'POST',
    body: { kind: PROJECT_GRANT_POLICY_KIND, ...payload },
  });
}

export type UpdateProjectGrantPayload = {
  environments?: string[];
  /** `null` clears the claims; an object replaces them. */
  tokenClaims?: JSONObject | null;
};

export async function updateProjectGrant(
  client: Client,
  issuerId: string,
  projectId: string,
  payload: UpdateProjectGrantPayload
): Promise<ProjectGrantPolicy> {
  return client.fetch<ProjectGrantPolicy>(
    projectGrantPath(issuerId, projectId),
    {
      method: 'PATCH',
      body: payload,
    }
  );
}

export async function deleteProjectGrant(
  client: Client,
  issuerId: string,
  projectId: string
): Promise<void> {
  await client.fetch(projectGrantPath(issuerId, projectId), {
    method: 'DELETE',
  });
}
