import type Client from '../client';
import { fetchAllPages, type Page, PaginationError } from '../pagination';

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

const MAX_PAGE_SIZE = 100;
/**
 * Longest search string, in characters, the key APIs accept; longer values
 * get a 400. Key names themselves have no cap.
 */
export const MAX_SEARCH_QUERY_CHARS = 256;

/** One page of AI Gateway keys. `next` is an opaque cursor, null at the end. */
export async function listApiKeysPage(
  client: Client,
  opts: { limit?: number; next?: string; search?: string } = {}
): Promise<Page<ApiKey>> {
  const query = new URLSearchParams({ purpose: 'ai-gateway' });
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.next) {
    query.set('until', opts.next);
  }
  if (opts.search) {
    query.set('search', opts.search);
  }
  const { apiKeys, pagination } = await client.fetch<ListApiKeysResponse>(
    `/v1/api-keys?${query.toString()}`,
    { method: 'GET' }
  );
  return { items: apiKeys ?? [], next: pagination?.next ?? null };
}

/** Every AI Gateway key, following cursors. Fails rather than truncating. */
export async function listAllApiKeys(
  client: Client,
  opts: { search?: string } = {}
): Promise<ApiKey[]> {
  return fetchAllPages(next =>
    listApiKeysPage(client, { ...opts, limit: MAX_PAGE_SIZE, next })
  );
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
  | { error: 'ambiguous'; count: number }
  | { error: 'incomplete'; message: string };

export type ApiKeyLookupError = Extract<ResolvedApiKey, { error: string }>;

/** User-facing message for a failed `findApiKeyByIdOrName` lookup. */
export function describeApiKeyLookupError(
  identifier: string,
  resolved: ApiKeyLookupError
): string {
  switch (resolved.error) {
    case 'ambiguous':
      return `Multiple API keys named "${identifier}" (${resolved.count}). Use the key id instead.`;
    case 'incomplete':
      return `Could not search every API key for "${identifier}": ${resolved.message} Use the key id instead.`;
    default:
      return `API key not found: ${identifier}`;
  }
}

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

  // `search` narrows server-side by substring; exact match is checked here.
  const search =
    identifier.length <= MAX_SEARCH_QUERY_CHARS ? identifier : undefined;
  let keys: ApiKey[];
  try {
    keys = await listAllApiKeys(client, { search });
  } catch (err) {
    if (err instanceof PaginationError) {
      return { error: 'incomplete', message: err.message };
    }
    throw err;
  }
  const matches = keys.filter(key => key.name === identifier);
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
  tokenPass?: true;
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
