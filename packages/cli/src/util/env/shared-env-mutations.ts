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
