import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';

export const INFERENCE_HOOK_MODES = ['shadow', 'enforce'] as const;
export const INFERENCE_HOOK_FAILURE_MODES = ['open', 'closed'] as const;

export type InferenceHookMode = (typeof INFERENCE_HOOK_MODES)[number];
export type InferenceHookFailureMode =
  (typeof INFERENCE_HOOK_FAILURE_MODES)[number];

export interface InferenceHookHeader {
  name: string;
  value: string;
}

/** The config fields `PUT /ai-gateway/inference-hooks` replaces as a whole. */
export interface InferenceHooksEntry {
  endpointUrl: string;
  enabled: boolean;
  mode: InferenceHookMode;
  failureMode: InferenceHookFailureMode;
  timeoutMs: number;
  rolloutPercent: number;
}

export type InferenceHooksConfig =
  | { configured: false }
  | (InferenceHooksEntry & {
      configured: true;
      updatedAt: number;
      headers: { names: string[]; updatedAt: number | null };
    });

export type SigningSecretMetadata =
  | { exists: false }
  | {
      exists: true;
      secretId: string;
      createdAt: number;
      rotatedAt: number | null;
    };

export interface IssuedSigningSecret {
  signingSecret: string;
  secretId: string;
  createdAt: number;
  rotatedAt: number | null;
  rotated: boolean;
}

export type ConnectionTestResult =
  | {
      ok: true;
      action: string;
      latencyMs: number;
      denyReason?: string;
      referenceId?: string;
    }
  | {
      ok: false;
      failure: string;
      latencyMs?: number;
      status?: number;
      detail?: string;
    };

const BASE = '/ai-gateway/inference-hooks';

// A retried write can land twice: a rotate would lose the new secret to a 409,
// and a test would send a second request to the team's server.
const WRITE_OPTS = { retry: { retries: 0 } } as const;

export function getInferenceHooksConfig(
  client: Client
): Promise<InferenceHooksConfig> {
  return client.fetch<InferenceHooksConfig>(BASE, { method: 'GET' });
}

/**
 * The body of `PUT /ai-gateway/inference-hooks`. Omitted fields take the API's
 * defaults; omitted `headers` keeps the stored set unless the URL changed.
 */
export type InferenceHooksPutBody = Pick<InferenceHooksEntry, 'endpointUrl'> &
  Partial<Omit<InferenceHooksEntry, 'endpointUrl'>> & {
    headers?: InferenceHookHeader[];
  };

export function putInferenceHooksConfig(
  client: Client,
  body: InferenceHooksPutBody
): Promise<InferenceHooksConfig> {
  return client.fetch<InferenceHooksConfig>(BASE, {
    method: 'PUT',
    body: body as unknown as JSONObject,
    ...WRITE_OPTS,
  });
}

export async function deleteInferenceHooksConfig(
  client: Client
): Promise<void> {
  await client.fetch(BASE, { method: 'DELETE', json: false, ...WRITE_OPTS });
}

export function getSigningSecretMetadata(
  client: Client
): Promise<SigningSecretMetadata> {
  return client.fetch<SigningSecretMetadata>(`${BASE}/signing-secret`, {
    method: 'GET',
  });
}

/** `null` creates the first secret; the current `secretId` rotates it. */
export function issueSigningSecret(
  client: Client,
  expectedSecretId: string | null
): Promise<IssuedSigningSecret> {
  return client.fetch<IssuedSigningSecret>(`${BASE}/signing-secret`, {
    method: 'POST',
    body: { expectedSecretId },
    ...WRITE_OPTS,
  });
}

export function testInferenceHookConnection(
  client: Client,
  body: {
    endpointUrl: string;
    timeoutMs?: number;
    headers?: InferenceHookHeader[];
  }
): Promise<ConnectionTestResult> {
  return client.fetch<ConnectionTestResult>(`${BASE}/test`, {
    method: 'POST',
    body: body as unknown as JSONObject,
    ...WRITE_OPTS,
    bailOn429: true,
  });
}
