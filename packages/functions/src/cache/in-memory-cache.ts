import { RuntimeCache } from './types';

interface CacheEntry {
  value: unknown;
  tags: Set<string>;
  lastModified: number; // Timestamp of when the entry was last modified in epoch milliseconds
  ttl?: number; // Time to live in seconds
}

export class InMemoryCache implements RuntimeCache {
  private runtimeCache: Record<string, CacheEntry> = {};

  async cache(
    key: string,
    fn: (...args: any[]) => Promise<unknown>,
    options?: { tags?: string[]; ttl?: number }
  ): Promise<unknown | null> {
    return this.get(key, options).then(val => {
      if (val == null) {
        return fn().then(result => {
          this.set(key, result, options);
          return result;
        });
      }
      return Promise.resolve(val);
    });
  }

  async get(
    key: string,
    options?: { tags?: string[]; ttl?: number }
  ): Promise<unknown | null> {
    const entry = this.runtimeCache[key];
    if (entry) {
      if (entry.ttl && entry.lastModified + entry.ttl * 1000 < Date.now()) {
        // If the entry is expired, delete it and return null
        await this.delete(key);
        return null;
      }
      // if tags are specified, add them to the entry's tags set
      if (options?.tags) {
        for (const tag of options.tags) {
          entry.tags.add(tag);
        }
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
    this.runtimeCache[key] = {
      value,
      lastModified: Date.now(),
      ttl: options?.ttl,
      tags: new Set(options?.tags || []),
    };
  }

  async delete(key: string): Promise<void> {
    delete this.runtimeCache[key];
  }

  async expireTag(tag: string | string[]): Promise<void> {
    const tags = Array.isArray(tag) ? tag : [tag];
    // Iterate over all entries in the cache
    for (const key in this.runtimeCache) {
      if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
        const entry = this.runtimeCache[key];
        // If any of the entry's tags match the specified tags, delete this entry
        if (tags.some(t => entry.tags.has(t))) {
          delete this.runtimeCache[key];
        }
      }
    }
  }
}
