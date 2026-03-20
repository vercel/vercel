import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryCache } from '../../../src/cache/in-memory-cache';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set', () => {
    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should store and retrieve string values', async () => {
      await cache.set('key', 'value');
      const result = await cache.get('key');
      expect(result).toBe('value');
    });

    it('should store and retrieve object values', async () => {
      const obj = { foo: 'bar', count: 42 };
      await cache.set('key', obj);
      const result = await cache.get('key');
      expect(result).toEqual(obj);
    });

    it('should store and retrieve array values', async () => {
      const arr = [1, 2, 3, { nested: true }];
      await cache.set('key', arr);
      const result = await cache.get('key');
      expect(result).toEqual(arr);
    });

    it('should store and retrieve null values', async () => {
      await cache.set('key', null);
      const result = await cache.get('key');
      expect(result).toBeNull();
    });

    it('should coerce undefined to null', async () => {
      await cache.set('key', undefined);
      const result = await cache.get('key');
      expect(result).toBeNull();
    });
  });

  describe('JSON serialization consistency with BuildCache', () => {
    it('should convert Date objects to ISO strings', async () => {
      const date = new Date('2024-01-15T12:00:00.000Z');
      await cache.set('key', { date });
      const result = (await cache.get('key')) as { date: unknown };
      expect(result.date).toBe('2024-01-15T12:00:00.000Z');
      expect(result.date).not.toBeInstanceOf(Date);
    });

    it('should lose undefined values in objects', async () => {
      const obj = { a: 1, b: undefined, c: 3 };
      await cache.set('key', obj);
      const result = (await cache.get('key')) as Record<string, unknown>;
      expect(result).toEqual({ a: 1, c: 3 });
      expect('b' in result).toBe(false);
    });

    it('should convert undefined to null in arrays', async () => {
      const arr = [1, undefined, 3];
      await cache.set('key', arr);
      const result = await cache.get('key');
      expect(result).toEqual([1, null, 3]);
    });

    it('should not preserve object references', async () => {
      const obj = { foo: 'bar' };
      await cache.set('key', obj);
      const result = await cache.get('key');
      expect(result).toEqual(obj);
      expect(result).not.toBe(obj);
    });

    it('should lose Map and Set types', async () => {
      const map = new Map([['a', 1]]);
      const set = new Set([1, 2, 3]);
      await cache.set('map', map);
      await cache.set('set', set);
      expect(await cache.get('map')).toEqual({});
      expect(await cache.get('set')).toEqual({});
    });

    it('should lose function properties', async () => {
      const obj = { a: 1, fn: () => 'test' };
      await cache.set('key', obj);
      const result = (await cache.get('key')) as Record<string, unknown>;
      expect(result).toEqual({ a: 1 });
      expect('fn' in result).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    it('should return value before TTL expires', async () => {
      await cache.set('key', 'value', { ttl: 60 });
      vi.advanceTimersByTime(59 * 1000);
      const result = await cache.get('key');
      expect(result).toBe('value');
    });

    it('should return null after TTL expires', async () => {
      await cache.set('key', 'value', { ttl: 60 });
      vi.advanceTimersByTime(61 * 1000);
      const result = await cache.get('key');
      expect(result).toBeNull();
    });

    it('should not expire entries without TTL', async () => {
      await cache.set('key', 'value');
      vi.advanceTimersByTime(1000 * 60 * 60 * 24); // 24 hours
      const result = await cache.get('key');
      expect(result).toBe('value');
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      await cache.set('key', 'value');
      await cache.delete('key');
      const result = await cache.get('key');
      expect(result).toBeNull();
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(cache.delete('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('expireTag', () => {
    it('should expire entries with matching tag', async () => {
      await cache.set('key1', 'value1', { tags: ['tag-a'] });
      await cache.set('key2', 'value2', { tags: ['tag-b'] });
      await cache.expireTag('tag-a');
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBe('value2');
    });

    it('should expire entries with any matching tag from array', async () => {
      await cache.set('key1', 'value1', { tags: ['tag-a'] });
      await cache.set('key2', 'value2', { tags: ['tag-b'] });
      await cache.set('key3', 'value3', { tags: ['tag-c'] });
      await cache.expireTag(['tag-a', 'tag-b']);
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBe('value3');
    });

    it('should expire entries with multiple tags if any match', async () => {
      await cache.set('key', 'value', { tags: ['tag-a', 'tag-b', 'tag-c'] });
      await cache.expireTag('tag-b');
      expect(await cache.get('key')).toBeNull();
    });

    it('should not affect entries without tags', async () => {
      await cache.set('key', 'value');
      await cache.expireTag('any-tag');
      expect(await cache.get('key')).toBe('value');
    });
  });
});
