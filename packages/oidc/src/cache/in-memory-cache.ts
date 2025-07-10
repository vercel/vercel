import { RuntimeCache } from './types';

interface CacheEntry {
  value: unknown;
  tags: Set<string>;
  lastModified: number; // Timestamp of when the entry was last modified in epoch milliseconds
  ttl?: number; // Time to live in seconds
}

export class InMemoryCache implements RuntimeCache {
  private cache: Record<string, CacheEntry> = {};

  async get(key: string): Promise<unknown | null> {
    const entry = this.cache[key];
    if (entry) {
      if (entry.ttl && entry.lastModified + entry.ttl * 1000 < Date.now()) {
        // If the entry is expired, delete it and return null
        await this.delete(key);
        return null;
      }
      return entry.value;
    }
    return null;
  }

  async set(
    key: string,
    value: unknown,
    options?: { ttl?: number; tags?: string[] }
  ): Promise<void> {
    this.cache[key] = {
      value,
      lastModified: Date.now(),
      ttl: options?.ttl,
      tags: new Set(options?.tags || []),
    };
  }

  async delete(key: string): Promise<void> {
    delete this.cache[key];
  }

  async expireTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag];
    // Iterate over all entries in the cache
    for (const key in this.cache) {
      if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
        const entry = this.cache[key];
        // If any of the entry's tags match the specified tags, delete this entry
        if (tags.some(t => entry.tags.has(t))) {
          delete this.cache[key];
        }
      }
    }
  }
}
