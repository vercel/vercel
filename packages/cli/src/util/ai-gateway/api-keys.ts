import type Client from '../client';

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

export type AiGatewayQuota = {
  limitAmount?: number;
  refreshPeriod?: string;
  includeByokInQuota?: boolean;
  alertThresholds?: number[];
};

type CreateApiKeyRequest = {
  purpose: 'ai-gateway';
  name?: string;
  aiGatewayQuota?: AiGatewayQuota;
  expiresAt?: number;
};

type CreateApiKeyApiKey = {
  id: string;
  name: string;
  partialKey: string;
  teamId: string;
  purpose: string;
  createdAt: number;
};

export type CreateApiKeyResponse = {
  apiKeyString: string;
  apiKey: CreateApiKeyApiKey;
};

export async function createApiKey(
  client: Client,
  payload: {
    name?: string;
    aiGatewayQuota?: AiGatewayQuota;
    expiresAt?: number;
  }
): Promise<CreateApiKeyResponse> {
  return await client.fetch<CreateApiKeyResponse>('/v1/api-keys', {
    method: 'POST',
    body: {
      purpose: 'ai-gateway',
      ...payload,
    } satisfies CreateApiKeyRequest,
  });
}
