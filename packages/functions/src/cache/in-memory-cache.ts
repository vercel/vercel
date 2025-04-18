import { RuntimeCache } from './types';

interface CacheEntry {
  value: unknown;
  lastModified: number;
  tags?: string[];
  ttl?: number;
}

export class InMemoryCache implements RuntimeCache {
  private cache: Record<string, CacheEntry> = {};

  async get(
    key: string,
    options?: { tags?: string[] }
  ): Promise<unknown | null> {
    const entry = this.cache[key];
    if (entry) {
      if (entry.ttl && entry.lastModified + entry.ttl * 1000 < Date.now()) {
        // If the entry is expired, delete it and return null
        await this.delete(key);
        return null;
      }
      // if tags are specified, update the entry with the new tags
      if (options?.tags) {
        for (const tag of options.tags) {
          if (!entry.tags?.includes(tag)) {
            entry.tags = [...(entry.tags ?? []), tag];
          }
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
    this.cache[key] = {
      value,
      lastModified: Date.now(),
      ttl: options?.ttl ?? undefined,
      tags: options?.tags,
    };
  }

  async delete(key: string): Promise<void> {
    delete this.cache[key];
  }

  async revalidateTag(tag: string | string[]): Promise<void> {
    const tags = [tag].flat();
    // Iterate over all entries in the cache
    for (const key in this.cache) {
      if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
        const entry = this.cache[key];
        // If the value's tags include the specified tag, delete this entry
        if (entry.tags?.some((tag: string) => tags.includes(tag))) {
          delete this.cache[key];
        }
      }
    }
  }
}
