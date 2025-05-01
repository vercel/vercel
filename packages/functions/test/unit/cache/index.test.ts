import {
  afterEach,
  beforeEach,
  describe,
  expect,
  Mock,
  test,
  vitest,
} from 'vitest';

import { getFunctionCache } from '../../../src/cache/index';
import { InMemoryCache } from '../../../src/cache/in-memory-cache';
import { getContext } from '../../../src/get-context';

vitest.mock('../../../src/get-context', () => ({
  getContext: vitest.fn(),
}));

describe('getRuntimeCache', () => {
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
    const cache = getFunctionCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
    expect(mockCache.set).toHaveBeenCalledWith('b876d32', 'value', undefined);
    expect(mockCache.get).toHaveBeenCalledWith('b876d32', undefined);
  });

  test('should use InMemoryCache if context cache is not available', async () => {
    (getContext as Mock).mockReturnValue({});
    const cache = getFunctionCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('should use the provided key hash function', async () => {
    const customHashFunction = vitest.fn((key: string) => `custom-${key}`);
    const cache = getFunctionCache({
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
    const cache = getFunctionCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
    expect(mockCache.get).toHaveBeenCalledWith('b876d32', undefined);
  });

  test('should use the provided namespace and separator', async () => {
    const cache = getFunctionCache({
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
    const cache = getFunctionCache({ namespace });
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
