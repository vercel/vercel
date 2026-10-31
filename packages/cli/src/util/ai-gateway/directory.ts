import Sema from 'async-sema';
import type Client from '../client';
import { isAPIError } from '../errors-ts';
import type { Page } from '../pagination';
import type { ApiKey, ApiKeyQuota } from './api-keys';

/**
 * Client for the AI Gateway key directory: an indexed, team-scoped read model
 * of key metadata served by `/ai-gateway/directory/*`. It answers list,
 * search, and batch lookups without fanning out over the canonical key store,
 * and never holds secrets or budgets. Budgets come from a separate batch call.
 *
 * The directory is eventually consistent and may be unavailable (no serving
 * generation, timeout, rate limit); callers fall back to `/v1/api-keys`.
 */

export const DIRECTORY_KEY_SORTS = [
  'createdAt:desc',
  'createdAt:asc',
  'lastActiveAt:desc',
  'lastActiveAt:asc',
  'name:asc',
  'name:desc',
  'expiresAt:asc',
  'expiresAt:desc',
] as const;
export type DirectoryKeySort = (typeof DIRECTORY_KEY_SORTS)[number];

// `expired` is a view over live keys past `expiresAt`; items still carry
// `state: 'active'`. `active` excludes them; `any` applies no filter.
export const DIRECTORY_KEY_STATES = [
  'active',
  'expired',
  'deleted',
  'purged',
  'any',
] as const;
export type DirectoryKeyState = (typeof DIRECTORY_KEY_STATES)[number];

export type DirectoryKeyMetadata = {
  schemaVersion: 1;
  keyId: string;
  teamId: string;
  createdBy?: string;
  name: string;
  suffix?: string;
  projectId?: string;
  accessPolicyId?: string;
  environment?: string;
  state: 'active' | 'deleted' | 'purged';
  createdAt: number;
  lastActiveAt?: number;
  expiresAt?: number;
  leakedAt?: number;
  deletedAt?: number;
  purgedObservedAt?: number;
  attribution?: {
    spendAttribution?: string;
    issuanceMethod?: string;
    createdByAppId?: string;
  };
};

export type DirectoryGeneration = {
  id: string;
  status: 'bootstrapping' | 'complete' | 'serving' | 'retired';
  shadow: boolean;
};

type DirectoryPage<T> = {
  schemaVersion: 1;
  data: T;
  cursor: string | null;
  complete: boolean;
  meta: { generation: DirectoryGeneration };
};

export type DirectoryUserLabel = {
  uid: string;
  username: string;
  name?: string;
  avatar?: string;
};

export type DirectoryKeyQuota = ApiKeyQuota & { apiKeyId: string };

type IdentitiesResolveData = {
  keys: DirectoryKeyMetadata[];
  users:
    | DirectoryUserLabel[]
    | { error: { code: 'user_labels_unavailable'; message: string } };
  missing: { keyIds: string[]; userIds: string[] | null };
};

type KeyQuotasData = {
  quotas: DirectoryKeyQuota[];
  missing: { keyIds: string[] };
};

/** The API rejects larger batches with a 400. */
export const MAX_DIRECTORY_RESOLVE_IDS = 100;

// One attempt, and rate limits bail at once: an unavailable directory should
// fall back to the canonical store quickly, not wait out a Retry-After window.
const FETCH_OPTS = { retry: { retries: 0 }, bailOn429: true } as const;

/**
 * Deploy-time kill switch for the directory reader. Any value other than
 * `0`/`false` (or unset) keeps the directory on.
 */
export const DIRECTORY_KILL_SWITCH = 'VERCEL_AI_GATEWAY_DIRECTORY';

export function isDirectoryEnabledByEnv(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const value = env[DIRECTORY_KILL_SWITCH]?.trim().toLowerCase();
  return value !== '0' && value !== 'false';
}

export type ListDirectoryKeysOptions = {
  search?: string;
  createdBy?: string;
  accessPolicyId?: string;
  state?: DirectoryKeyState;
  sort?: DirectoryKeySort;
  cursor?: string;
  limit?: number;
};

/** One page of key metadata. `next` is an opaque cursor, null at the end. */
export async function listDirectoryKeysPage(
  client: Client,
  opts: ListDirectoryKeysOptions = {}
): Promise<Page<DirectoryKeyMetadata>> {
  const query = new URLSearchParams();
  const search = opts.search?.trim();
  if (search) {
    query.set('search', search);
  }
  if (opts.createdBy) {
    query.set('createdBy', opts.createdBy);
  }
  if (opts.accessPolicyId) {
    query.set('accessPolicyId', opts.accessPolicyId);
  }
  if (opts.state) {
    query.set('state', opts.state);
  }
  if (opts.sort) {
    query.set('sort', opts.sort);
  }
  if (opts.cursor) {
    query.set('cursor', opts.cursor);
  }
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  const qs = query.toString();
  const page = await client.fetch<DirectoryPage<DirectoryKeyMetadata[]>>(
    `/ai-gateway/directory/keys${qs ? `?${qs}` : ''}`,
    { method: 'GET', ...FETCH_OPTS }
  );
  return { items: page.data ?? [], next: page.cursor ?? null };
}

export type ResolvedDirectoryIdentities = {
  /** Found keys by id, including deleted and purged keys. */
  keys: Map<string, DirectoryKeyMetadata>;
  /** Found user labels by uid; null when the API could not load labels. */
  users: Map<string, DirectoryUserLabel> | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Batch chunks are independent; a few in flight keeps a 1,600-id lookup to a
// handful of round trips while staying well under the 120/min rate limit.
const BATCH_CONCURRENCY = 4;

async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const sema = new Sema(BATCH_CONCURRENCY);
  return Promise.all(
    items.map(async item => {
      await sema.acquire();
      try {
        return await fn(item);
      } finally {
        sema.release();
      }
    })
  );
}

/** Batch id → metadata/label lookup; ids are deduped and chunked per request. */
export async function resolveDirectoryIdentities(
  client: Client,
  input: { keyIds?: string[]; userIds?: string[] }
): Promise<ResolvedDirectoryIdentities> {
  const keyChunks = chunk(
    [...new Set(input.keyIds ?? [])],
    MAX_DIRECTORY_RESOLVE_IDS
  );
  const userChunks = chunk(
    [...new Set(input.userIds ?? [])],
    MAX_DIRECTORY_RESOLVE_IDS
  );
  const requests = Math.max(keyChunks.length, userChunks.length);
  const bodies = Array.from({ length: requests }, (_, i) => {
    const body: { keyIds?: string[]; userIds?: string[] } = {};
    if (keyChunks[i]?.length) {
      body.keyIds = keyChunks[i];
    }
    if (userChunks[i]?.length) {
      body.userIds = userChunks[i];
    }
    return body;
  });
  const pages = await mapConcurrent(bodies, body =>
    client.fetch<DirectoryPage<IdentitiesResolveData>>(
      '/ai-gateway/directory/identities/resolve',
      { method: 'POST', body, ...FETCH_OPTS }
    )
  );
  const keys = new Map<string, DirectoryKeyMetadata>();
  let users: Map<string, DirectoryUserLabel> | null = new Map();
  pages.forEach((res, i) => {
    for (const key of res.data?.keys ?? []) {
      keys.set(key.keyId, key);
    }
    if (Array.isArray(res.data?.users)) {
      for (const user of res.data.users) {
        users?.set(user.uid, user);
      }
    } else if (bodies[i].userIds) {
      users = null;
    }
  });
  return { keys, users };
}

/**
 * Explicit budgets for the given keys. A key absent from the result has no
 * budget of its own (defaults are not included) or is not visible.
 */
export async function resolveDirectoryKeyQuotas(
  client: Client,
  keyIds: string[]
): Promise<Map<string, DirectoryKeyQuota>> {
  const pages = await mapConcurrent(
    chunk([...new Set(keyIds)], MAX_DIRECTORY_RESOLVE_IDS),
    ids =>
      client.fetch<DirectoryPage<KeyQuotasData>>(
        '/ai-gateway/directory/keys/quotas',
        { method: 'POST', body: { keyIds: ids }, ...FETCH_OPTS }
      )
  );
  const quotas = new Map<string, DirectoryKeyQuota>();
  for (const res of pages) {
    for (const quota of res.data?.quotas ?? []) {
      quotas.set(quota.apiKeyId, quota);
    }
  }
  return quotas;
}

/**
 * True when the directory could not answer and the canonical store should be
 * read instead: no serving generation (503), timeout (504), rate limit (429),
 * or any other server-side failure. Client errors (400/403) are not retried
 * elsewhere; they describe the request, not the directory.
 */
export function isDirectoryUnavailable(err: unknown): boolean {
  return isAPIError(err) && (err.status === 429 || err.status >= 500);
}

/**
 * Directory cursors are base64url JSON fingerprinted to their query; legacy
 * `/v1/api-keys` cursors are not. Lets the fallback refuse to send one store's
 * cursor to the other.
 */
export function isDirectoryCursor(cursor: string): boolean {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      parsed.v === 1 &&
      typeof parsed.fp === 'string' &&
      Array.isArray(parsed.sa)
    );
  } catch {
    return false;
  }
}

/**
 * Projects directory metadata onto the `/v1/api-keys` key shape so list output
 * (table and JSON) stays identical whichever store answered. Fields the index
 * does not carry (`metadata`, `leakedUrl`) are null or omitted.
 */
export function toApiKey(
  key: DirectoryKeyMetadata,
  quota?: DirectoryKeyQuota
): ApiKey {
  const apiKey: ApiKey = {
    id: key.keyId,
    name: key.name,
    partialKey: key.suffix ?? '',
    teamId: key.teamId,
    purpose: 'ai-gateway',
    projectId: key.projectId ?? null,
    expiresAt: key.expiresAt ?? null,
    activeAt: key.lastActiveAt ?? key.createdAt,
    createdAt: key.createdAt,
    createdBy: key.createdBy ?? '',
    leakedAt: key.leakedAt ?? null,
    leakedUrl: null,
    createdByAppId: key.attribution?.createdByAppId ?? null,
  };
  if (quota) {
    const { apiKeyId: _apiKeyId, ...rest } = quota;
    apiKey.quota = rest;
  }
  return apiKey;
}
