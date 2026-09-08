// In-memory Runtime Cache for local development.
//
// The dev server owns a single store and exposes it over HTTP so that every
// service, sidecar, and function shares one cache, the same way they share one
// Runtime Cache in a deployment. Without it each process falls back to its own
// process-local cache and cross-service reads always miss.

import ms from 'ms';

/** Internal dev path that fronts the store. */
export const DEV_RUNTIME_CACHE_PREFIX = '/_svc/_cache/';

/**
 * Item path, mirroring the public Runtime Cache API so the endpoint is
 * interchangeable with the deployed one.
 */
export const DEV_RUNTIME_CACHE_ITEM_PREFIX = `${DEV_RUNTIME_CACHE_PREFIX}v1/suspense-cache/`;

export const HEADER_CACHE_STATE = 'x-vercel-cache-state';
export const HEADER_CACHE_TAGS = 'x-vercel-cache-tags';
export const HEADER_REVALIDATE = 'x-vercel-revalidate';
export const HEADER_CACHE_ITEM_NAME = 'x-vercel-cache-item-name';

const TICK_INTERVAL = ms('1m');

/**
 * Environment that points the Runtime Cache clients in `@vercel/functions` and
 * the Vercel Python SDK at the dev server's store.
 */
export function getDevRuntimeCacheEnv(origin: string): Record<string, string> {
  return {
    RUNTIME_CACHE_ENDPOINT: `${origin}${DEV_RUNTIME_CACHE_ITEM_PREFIX}`,
    RUNTIME_CACHE_HEADERS: JSON.stringify({
      authorization: 'Bearer vc-dev-token',
    }),
  };
}

export interface SetOptions {
  ttlSeconds?: number;
  tags?: string[];
}

export interface CacheHit {
  value: Buffer;
  tags: string[];
  ageSeconds: number;
}

interface CacheEntry {
  value: Buffer;
  tags: string[];
  ttlMs: number | null;
  lastModified: number;
  /** Mutation counter at write time, used to order writes against tag expiry. */
  sequence: number;
}

export class RuntimeCacheStore {
  private entries = new Map<string, CacheEntry>();
  /** Tag name to the mutation counter of its last expiry. */
  private tagExpirations = new Map<string, number>();
  private sequence = 0;
  private tickTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL);
    this.tickTimer.unref();
  }

  get(key: string): CacheHit | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (this.isStale(entry)) {
      this.entries.delete(key);
      return null;
    }

    return {
      value: entry.value,
      tags: entry.tags,
      ageSeconds: Math.floor((Date.now() - entry.lastModified) / 1000),
    };
  }

  set(key: string, value: Buffer, options: SetOptions = {}): void {
    const ttlSeconds = options.ttlSeconds;
    this.entries.set(key, {
      value,
      tags: options.tags ?? [],
      ttlMs: ttlSeconds && ttlSeconds > 0 ? ttlSeconds * 1000 : null,
      lastModified: Date.now(),
      sequence: ++this.sequence,
    });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Mark tags as expired. Entries written before the expiration miss on their
   * next read; entries written after it stay fresh, matching how tag
   * revalidation works in a deployment.
   */
  expireTags(tags: string[]): void {
    const sequence = ++this.sequence;
    for (const tag of tags) {
      this.tagExpirations.set(tag, sequence);
    }
  }

  size(): number {
    return this.entries.size;
  }

  stop(): void {
    clearInterval(this.tickTimer);
  }

  private isStale(entry: CacheEntry): boolean {
    if (
      entry.ttlMs !== null &&
      entry.lastModified + entry.ttlMs <= Date.now()
    ) {
      return true;
    }

    for (const tag of entry.tags) {
      const expiredAt = this.tagExpirations.get(tag);
      if (expiredAt !== undefined && expiredAt > entry.sequence) {
        return true;
      }
    }

    return false;
  }

  /** Drop stale entries so their values don't accumulate over a dev session. */
  private tick(): void {
    for (const [key, entry] of this.entries) {
      if (this.isStale(entry)) {
        this.entries.delete(key);
      }
    }
  }
}
