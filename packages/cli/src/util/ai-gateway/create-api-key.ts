import type Client from '../client';

export type AiGatewayQuota = {
  limitAmount?: number;
  refreshPeriod?: string;
  includeByokInQuota?: boolean;
};

type CreateApiKeyRequest = {
  purpose: 'ai-gateway';
  name?: string;
  aiGatewayQuota?: AiGatewayQuota;
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

export default async function createApiKey(
  client: Client,
  payload: { name?: string; aiGatewayQuota?: AiGatewayQuota }
): Promise<CreateApiKeyResponse> {
  return await client.fetch<CreateApiKeyResponse>('/v1/api-keys', {
    method: 'POST',
    body: {
      purpose: 'ai-gateway',
      ...payload,
    } satisfies CreateApiKeyRequest,
  });
}
