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
  metadata?: ApiKeyMetadata;
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

export type UpdateApiKeyQuotaInput = {
  limitAmount?: number;
  refreshPeriod?: ApiKeyQuota['refreshPeriod'];
  includeByokInQuota?: boolean;
  active?: boolean;
  archived?: boolean;
};

// Upserts or archives a key's spend quota; archiving leaves the key untouched.
export async function updateApiKeyQuota(
  client: Client,
  apiKeyId: string,
  input: UpdateApiKeyQuotaInput
): Promise<{ apiKey: ApiKey; quota: ApiKeyQuota }> {
  return client.fetch<{ apiKey: ApiKey; quota: ApiKeyQuota }>(
    `/v1/api-keys/${encodeURIComponent(apiKeyId)}/quota`,
    { method: 'PATCH', body: input }
  );
}

export type ResolvedApiKey =
  | { apiKey: ApiKey }
  | { error: 'not_found' }
  | { error: 'ambiguous'; count: number };

// Resolves a key by id, then by exact name; duplicate names are ambiguous.
export async function findApiKeyByIdOrName(
  client: Client,
  identifier: string
): Promise<ResolvedApiKey> {
  try {
    const apiKey = await getApiKey(client, identifier);
    if (apiKey && apiKey.purpose === 'ai-gateway') {
      return { apiKey };
    }
  } catch {}

  const matches = (await listApiKeys(client)).filter(
    key => key.name === identifier
  );
  if (matches.length === 1) {
    return { apiKey: matches[0] };
  }
  if (matches.length > 1) {
    return { error: 'ambiguous', count: matches.length };
  }
  return { error: 'not_found' };
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
  metadata?: ApiKeyMetadata;
};

// `zdr` exempts the key from ZDR-only models, `bypassAll` from every team restriction.
export type ApiKeyMetadata = {
  zdr?: { enableNonZdrModels: true };
  bypassAll?: true;
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
    metadata?: ApiKeyMetadata;
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
