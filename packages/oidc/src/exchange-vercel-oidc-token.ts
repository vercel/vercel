import { version } from './version';

/**
 * The options for the `exchangeVercelOidcToken` function.
 *
 * @typedef {Object} ExchangeVercelOidcTokenOptions
 * @property {string} token - The token to exchange.
 * @property {string} audience - Optional audience to set on the exchanged token.
 * @property {string} jti - Optional JTI to set on the exchanged token.
 * @property {boolean} skipCache - Optional flag to bypass the in-memory cache.
 */
export interface ExchangeVercelOidcTokenOptions {
  /**
   * The token to exchange.
   */
  token: string;
  /**
   * Optional audience to set on the exchanged token.
   * @default undefined
   */
  audience?: string;
  /**
   * Optional JTI to set on the exchanged token.
   * @default undefined
   */
  jti?: string;
  /**
   * When `true`, bypasses the in-memory exchange cache and performs a fresh
   * token exchange. The freshly exchanged token still replaces any cached entry.
   * @default false
   */
  skipCache?: boolean;
}

interface CacheEntry {
  token: string;
  /** Epoch milliseconds after which the cached token must not be reused. */
  expiresAt: number;
}

/**
 * Bounded, expiry-aware, in-memory cache of exchanged tokens keyed by a hash of
 * token + audience + jti. Entries are evicted once their API-provided expiry
 * passes, and the cache is bounded via least-recently-used eviction so callers
 * that rotate tokens frequently — or pass a unique `jti` each time — can't grow
 * it without bound. Because the source token is part of the key, a rotated
 * token yields a new key (and a fresh exchange), while a still-valid token
 * reuses its cached exchange, avoiding a round-trip to the token exchange
 * endpoint on every call.
 */
class TokenCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly maxEntries: number) {}

  /**
   * Returns a cached token for the key when present and unexpired, refreshing
   * its recency for LRU eviction. Expired entries are removed on access.
   */
  get(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert to mark the entry as most-recently-used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.token;
  }

  /**
   * Stores a token under the key and evicts the least-recently-used entries
   * once the cache exceeds its size limit.
   */
  set({
    key,
    token,
    expiresAt,
  }: {
    key: string;
    token: string;
    expiresAt: number;
  }): void {
    // Delete first so the re-insert places the key at the most-recent position.
    this.entries.delete(key);
    this.entries.set(key, { token, expiresAt });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}

/**
 * Upper bound on the number of cached exchanges before least-recently-used
 * eviction kicks in.
 */
const MAX_CACHE_ENTRIES = 1000;

const tokenCache = new TokenCache(MAX_CACHE_ENTRIES);

/**
 * Derives a stable cache key from the source token, audience, and jti. The
 * inputs are SHA-256 hashed so the raw token is never retained as a map key and
 * the key length stays bounded regardless of input size.
 */
async function getCacheKey(
  options: ExchangeVercelOidcTokenOptions
): Promise<string> {
  const input = JSON.stringify([options.token, options.audience, options.jti]);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Exchanges a Vercel OIDC token for a Vercel token with a custom audience.
 *
 * @param {ExchangeVercelOidcTokenOptions} options - The options for the exchange.
 * @param {string} options.token - The token to exchange.
 * @param {string} options.audience - Optional audience to set on the exchanged token.
 * @param {string} options.jti - Optional JTI to set on the exchanged token.
 * @param {boolean} options.skipCache - Optional flag to bypass the in-memory cache and force a fresh exchange.
 * @throws {Error} If the token exchange fails.
 * @returns {Promise<string>} A promise that resolves to the exchanged token.
 */
export async function exchangeVercelOidcToken(
  options: ExchangeVercelOidcTokenOptions
): Promise<string> {
  const cacheKey = await getCacheKey(options);
  if (!options.skipCache) {
    const cached = tokenCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const response = await fetch('https://oidc.vercel.com/~token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': `@vercel/oidc@${version}`,
    },
    body: JSON.stringify({
      token: options.token,
      aud: options.audience,
      ...(options.jti ? { jti: options.jti } : undefined),
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to exchange token: ${await readErrorMessage(response)}`
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (_error) {
    throw new Error('Failed to exchange token: response was not valid JSON');
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !('token' in data) ||
    typeof data.token !== 'string'
  ) {
    throw new Error(
      'Failed to exchange token: response did not contain a token'
    );
  }
  const { token } = data;
  // `expiry` is the exchanged token's `exp` claim: an absolute Unix timestamp
  // in seconds. Only cache when the API provides it and it lies in the future.
  const expiry =
    'expiry' in data && typeof data.expiry === 'number'
      ? data.expiry
      : undefined;
  if (expiry !== undefined) {
    const expiresAt = expiry * 1000;
    if (expiresAt > Date.now()) {
      tokenCache.set({ key: cacheKey, token, expiresAt });
    }
  }
  return token;
}

/**
 * Reads the error message returned by the token exchange endpoint. On a non-2xx
 * response the API responds with a JSON object containing an `error` string;
 * fall back to the status text if the body is missing or malformed.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof data.error === 'string'
    ) {
      return data.error;
    }
  } catch (_error) {
    // Ignore parsing errors and fall back to the status text below.
  }
  return response.statusText || `HTTP ${response.status}`;
}
