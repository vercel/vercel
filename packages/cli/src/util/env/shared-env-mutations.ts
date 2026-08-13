import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import output from '../../output-manager';
import type {
  SharedEnvTarget,
  SharedEnvType,
  SharedEnvVariable,
} from './get-shared-env-records';

export interface SharedEnvFailure {
  code?: string;
  message?: string;
  envVarId?: string;
  key?: string;
}

export interface CreateSharedEnvOptions {
  key: string;
  value: string;
  comment?: string;
  target?: SharedEnvTarget[];
  projectId?: string[];
  type?: SharedEnvType;
}

interface CreateSharedEnvResponse {
  created: SharedEnvVariable[];
  failed: SharedEnvFailure[];
}

/**
 * Creates a single team Shared Environment Variable via `POST /v1/env`.
 * The plaintext value is sent in the request body only and is never logged.
 */
export async function createSharedEnvRecord(
  client: Client,
  { key, value, comment, target, projectId, type }: CreateSharedEnvOptions
): Promise<CreateSharedEnvResponse> {
  output.debug(`Creating Shared Environment Variable ${key}`);

  return client.fetch<CreateSharedEnvResponse>('/v1/env', {
    method: 'POST',
    body: {
      evs: [{ key, value, ...(comment ? { comment } : {}) }],
      ...(type ? { type } : {}),
      ...(target && target.length ? { target } : {}),
      ...(projectId && projectId.length ? { projectId } : {}),
    },
  });
}

export interface SharedEnvUpdate {
  key?: string;
  value?: string;
  comment?: string;
  target?: SharedEnvTarget[];
  type?: SharedEnvType;
  projectId?: string[];
  projectIdUpdates?: {
    link?: string[];
    unlink?: string[];
  };
}

interface UpdateSharedEnvResponse {
  updated: SharedEnvVariable[];
  failed: SharedEnvFailure[];
}

/**
 * Applies a sparse update to a team Shared Environment Variable via
 * `PATCH /v1/env`. Only the provided fields are changed. The plaintext value,
 * when present, is sent in the request body only and is never logged.
 */
export async function updateSharedEnvRecord(
  client: Client,
  id: string,
  update: SharedEnvUpdate
): Promise<UpdateSharedEnvResponse> {
  output.debug(`Updating Shared Environment Variable ${id}`);

  return client.fetch<UpdateSharedEnvResponse>('/v1/env', {
    method: 'PATCH',
    body: {
      updates: {
        [id]: update,
      },
    } as unknown as JSONObject,
  });
}

interface DeleteSharedEnvResponse {
  deleted: string[];
  failed: SharedEnvFailure[];
}

/**
 * Deletes a single team Shared Environment Variable via `DELETE /v1/env`.
 */
export async function deleteSharedEnvRecord(
  client: Client,
  id: string
): Promise<DeleteSharedEnvResponse> {
  output.debug(`Deleting Shared Environment Variable ${id}`);

  return client.fetch<DeleteSharedEnvResponse>('/v1/env', {
    method: 'DELETE',
    body: { ids: [id] },
  });
}

/**
 * Removes a project link from a Shared Environment Variable without deleting
 * the variable, via `PATCH /v1/env/:id/unlink/:projectId`. The project is
 * resolved by name or ID server-side.
 */
export async function unlinkSharedEnvProject(
  client: Client,
  id: string,
  projectIdOrName: string
): Promise<{ id: string }> {
  output.debug(`Unlinking project ${projectIdOrName} from ${id}`);

  return client.fetch<{ id: string }>(
    `/v1/env/${encodeURIComponent(id)}/unlink/${encodeURIComponent(
      projectIdOrName
    )}`,
    {
      method: 'PATCH',
    }
  );
}
