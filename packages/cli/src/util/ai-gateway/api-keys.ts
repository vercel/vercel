import type Client from '../client';

/**
 * AI Gateway quota attached to an API key. Mirrors the backend
 * `APIKeyQuotaSchema` (services/api-keys/src/lib/api-key-schema.ts).
 */
export type ApiKeyQuota = {
  quotaEntityId: string;
  limitAmount: number;
  currentSpend: number;
  currentByokSpend: number;
  includeByokInQuota: boolean;
  refreshPeriod: 'daily' | 'weekly' | 'monthly' | 'none';
  active: boolean;
  archived: boolean;
  alertThresholds?: number[];
  createdAt: number;
  updatedAt: number;
};

/**
 * An API key as returned by the api-keys service. Mirrors the backend
 * `APIKeySchema` (services/api-keys/src/lib/api-key-schema.ts).
 */
export type ApiKey = {
  id: string;
  name: string;
  partialKey: string;
  teamId: string;
  purpose: string;
  projectId: string | null;
  expiresAt: number | null;
  activeAt: number;
  createdAt: number;
  createdBy: string;
  leakedAt: number | null;
  leakedUrl: string | null;
  createdByAppId: string | null;
  quota?: ApiKeyQuota;
};

type ListApiKeysResponse = {
  apiKeys: ApiKey[];
  pagination: {
    count: number;
    next: string | null;
    prev: string | null;
  };
};

/**
 * List the current team's AI Gateway API keys. The list endpoint accepts an
 * optional `purpose` filter; we scope to `ai-gateway` so only Gateway keys
 * show up in this command family.
 */
export async function listApiKeys(client: Client): Promise<ApiKey[]> {
  const { apiKeys } = await client.fetch<ListApiKeysResponse>(
    '/v1/api-keys?purpose=ai-gateway',
    { method: 'GET' }
  );
  return apiKeys ?? [];
}

export async function getApiKey(
  client: Client,
  apiKeyId: string
): Promise<ApiKey> {
  const { apiKey } = await client.fetch<{ apiKey: ApiKey }>(
    `/v1/api-keys/${encodeURIComponent(apiKeyId)}`,
    { method: 'GET' }
  );
  return apiKey;
}

export async function deleteApiKey(
  client: Client,
  apiKeyId: string
): Promise<void> {
  await client.fetch(`/v1/api-keys/${encodeURIComponent(apiKeyId)}`, {
    method: 'DELETE',
  });
}
