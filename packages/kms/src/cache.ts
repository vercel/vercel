interface CacheEntry<V> {
  value: V;
  /** Epoch milliseconds after which the cached value must not be reused. */
  expiresAt: number;
}

/**
 * Bounded, expiry-aware, in-memory cache keyed by a hash of the request inputs
 * (including the OIDC token). Entries are evicted once their expiry passes, and
 * the cache is bounded via least-recently-used eviction so callers that rotate
 * tokens frequently can't grow it without bound. Because the OIDC token is part
 * of the key, a rotated token yields a new key (and a fresh signature), while a
 * still-valid token reuses its cached result, avoiding a round-trip to the KMS
 * API on every call. Modeled on the token exchange cache in `@vercel/oidc`.
 */
export class SignatureCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();

  constructor(private readonly maxEntries: number) {}

  /**
   * Returns a cached value for the key when present and unexpired, refreshing
   * its recency for LRU eviction. Expired entries are removed on access.
   */
  get(key: string): V | undefined {
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
    return entry.value;
  }

  /**
   * Stores a value under the key and evicts the least-recently-used entries
   * once the cache exceeds its size limit.
   */
  set({
    key,
    value,
    expiresAt,
  }: {
    key: string;
    value: V;
    expiresAt: number;
  }): void {
    // Delete first so the re-insert places the key at the most-recent position.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt });
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
 * Derives a stable cache key from arbitrary request inputs. The inputs are
 * SHA-256 hashed so the raw OIDC token is never retained as a map key and the
 * key length stays bounded regardless of input size.
 */
export async function getCacheKey(parts: unknown[]): Promise<string> {
  const input = JSON.stringify(parts);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Reads the `exp` claim (Unix seconds) from a JWT and returns it as epoch
 * milliseconds, or `undefined` when the token can't be decoded or has no
 * numeric `exp`.
 */
export function getJwtExpiryMs(jwt: string): number | undefined {
  const payload = decodeJwtPayload(jwt);
  const exp = payload?.exp;
  return typeof exp === 'number' ? exp * 1000 : undefined;
}

/**
 * Decodes a JWT's payload (the second dot-separated segment, base64url-encoded
 * JSON) without verifying its signature. Returns `undefined` when the token is
 * malformed or the payload isn't a JSON object.
 */
function decodeJwtPayload(jwt: string): Record<string, unknown> | undefined {
  const segment = jwt.split('.')[1];
  if (!segment) {
    return undefined;
  }
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the earliest (smallest) of the provided expiry timestamps, ignoring
 * `undefined` values. Returns `undefined` when none are defined, signaling that
 * the result should not be cached.
 */
export function earliestExpiry(
  ...values: (number | undefined)[]
): number | undefined {
  const defined = values.filter((v): v is number => typeof v === 'number');
  return defined.length > 0 ? Math.min(...defined) : undefined;
}
