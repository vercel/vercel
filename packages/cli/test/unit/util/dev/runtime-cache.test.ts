import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_RUNTIME_CACHE_ITEM_PREFIX,
  RuntimeCacheStore,
  getDevRuntimeCacheEnv,
} from '../../../../src/util/dev/runtime-cache';

describe('getDevRuntimeCacheEnv', () => {
  it('points the Runtime Cache clients at the dev server', () => {
    const env = getDevRuntimeCacheEnv('http://localhost:3000');

    expect(env.RUNTIME_CACHE_ENDPOINT).toBe(
      `http://localhost:3000${DEV_RUNTIME_CACHE_ITEM_PREFIX}`
    );
    // The SDKs join the endpoint and the key without a separator.
    expect(env.RUNTIME_CACHE_ENDPOINT.endsWith('/')).toBe(true);
    // Both SDKs require a headers value that parses as a JSON object.
    expect(JSON.parse(env.RUNTIME_CACHE_HEADERS)).toEqual({
      authorization: 'Bearer vc-dev-token',
    });
  });
});

describe('RuntimeCacheStore', () => {
  let store: RuntimeCacheStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new RuntimeCacheStore();
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  it('returns null for keys that were never written', () => {
    expect(store.get('missing')).toBe(null);
  });

  it('returns the stored bytes unchanged', () => {
    store.set('key', Buffer.from('{"count":1}'));

    const hit = store.get('key');
    expect(hit?.value.toString()).toBe('{"count":1}');
    expect(hit?.tags).toEqual([]);
    expect(hit?.ageSeconds).toBe(0);
  });

  it('reports the age of an entry in seconds', () => {
    store.set('key', Buffer.from('"value"'));
    vi.advanceTimersByTime(2_500);

    expect(store.get('key')?.ageSeconds).toBe(2);
  });

  it('misses once the ttl has passed', () => {
    store.set('key', Buffer.from('"value"'), { ttlSeconds: 10 });

    vi.advanceTimersByTime(9_000);
    expect(store.get('key')).not.toBe(null);

    vi.advanceTimersByTime(1_000);
    expect(store.get('key')).toBe(null);
    expect(store.size()).toBe(0);
  });

  it('keeps entries without a ttl', () => {
    store.set('key', Buffer.from('"value"'));

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(store.get('key')).not.toBe(null);
  });

  it('deletes entries', () => {
    store.set('key', Buffer.from('"value"'));
    store.delete('key');

    expect(store.get('key')).toBe(null);
  });

  it('misses entries carrying an expired tag', () => {
    store.set('a', Buffer.from('"a"'), { tags: ['products', 'home'] });
    store.set('b', Buffer.from('"b"'), { tags: ['users'] });

    store.expireTags(['products']);

    expect(store.get('a')).toBe(null);
    expect(store.get('b')?.value.toString()).toBe('"b"');
  });

  it('keeps entries written after the tag expired', () => {
    store.set('key', Buffer.from('"stale"'), { tags: ['products'] });
    store.expireTags(['products']);
    store.set('key', Buffer.from('"fresh"'), { tags: ['products'] });

    expect(store.get('key')?.value.toString()).toBe('"fresh"');
  });

  it('exposes the tags an entry was written with', () => {
    store.set('key', Buffer.from('"value"'), { tags: ['products', 'home'] });

    expect(store.get('key')?.tags).toEqual(['products', 'home']);
  });

  it('sweeps expired entries in the background', () => {
    store.set('key', Buffer.from('"value"'), { ttlSeconds: 5 });

    vi.advanceTimersByTime(2 * 60 * 1000);

    expect(store.size()).toBe(0);
  });
});
