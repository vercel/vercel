import {
  afterEach,
  beforeEach,
  describe,
  expect,
  Mock,
  test,
  vitest,
} from 'vitest';

import { getCache } from '../../../src/cache/index';
import { InMemoryCache } from '../../../src/cache/in-memory-cache';
import { getContext } from '../../../src/get-context';

vitest.mock('../../../src/get-context', () => ({
  getContext: vitest.fn(),
}));

describe('getCache', () => {
  let mockCache: InMemoryCache;

  beforeEach(() => {
    mockCache = new InMemoryCache();
    vitest.spyOn(mockCache, 'set');
    vitest.spyOn(mockCache, 'get');
    (getContext as Mock).mockReturnValue({ cache: mockCache });
  });

  afterEach(() => {
    vitest.clearAllMocks();
  });

  test('should use the context cache if available', async () => {
    const cache = getCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
    expect(mockCache.set).toHaveBeenCalledWith('b876d32', 'value', undefined);
    expect(mockCache.get).toHaveBeenCalledWith('b876d32', undefined);
  });

  test('should return the same cache instance for multiple calls to getCache when no context cache is available', async () => {
    // Mock getContext to return an empty object (no context cache)
    (getContext as Mock).mockReturnValue({});

    // Get two cache instances
    const cache1 = getCache();
    const cache2 = getCache();

    // Set a value in the first cache
    await cache1.set('test-key', 'test-value');

    // Verify the second cache has access to the same data
    const result = await cache2.get('test-key');

    // The second cache should be able to access data set by the first cache
    expect(result).toBe('test-value');

    // Additional verification: setting a value in cache2 should be visible in cache1
    await cache2.set('another-key', 'another-value');
    const anotherResult = await cache1.get('another-key');
    expect(anotherResult).toBe('another-value');
  });

  test('should use InMemoryCache if context cache is not available', async () => {
    (getContext as Mock).mockReturnValue({});
    const cache = getCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('should use the provided key hash function', async () => {
    const customHashFunction = vitest.fn((key: string) => `custom-${key}`);
    const cache = getCache({
      keyHashFunction: customHashFunction,
    });
    await cache.set('key', 'value');
    expect(customHashFunction).toHaveBeenCalledWith('key');
    expect(mockCache.set).toHaveBeenCalledWith(
      'custom-key',
      'value',
      undefined
    );
  });

  test('should use the default key hash function if none is provided', async () => {
    const cache = getCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
    expect(mockCache.get).toHaveBeenCalledWith('b876d32', undefined);
  });

  test('should use the provided namespace and separator', async () => {
    const cache = getCache({
      namespace: 'test',
      namespaceSeparator: ':',
    });
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
    expect(mockCache.set).toHaveBeenCalledWith(
      'test:b876d32',
      'value',
      undefined
    );
    expect(mockCache.get).toHaveBeenCalledWith('test:b876d32', undefined);
  });

  test('should use the default namespace separator if none is provided', async () => {
    const namespace = 'test';
    const cache = getCache({ namespace });
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
    expect(mockCache.set).toHaveBeenCalledWith(
      `${namespace}$b876d32`,
      'value',
      undefined
    );
    expect(mockCache.get).toHaveBeenCalledWith(
      `${namespace}$b876d32`,
      undefined
    );
  });
});
