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
    (getContext as Mock).mockReturnValue({ cache: mockCache });
  });

  afterEach(() => {
    vitest.clearAllMocks();
  });

  test('should use the context cache if available', async () => {
    const cache = await getFunctionCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('should use InMemoryCache if context cache is not available', async () => {
    (getContext as Mock).mockReturnValue({});
    const cache = await getFunctionCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('should use the provided key hash function', async () => {
    const customHashFunction = vitest.fn((key: string) => `custom-${key}`);
    const cache = await getFunctionCache({
      keyHashFunction: customHashFunction,
    });
    await cache.set('key', 'value');
    expect(customHashFunction).toHaveBeenCalledWith('key');
  });

  test('should use the default key hash function if none is provided', async () => {
    const cache = await getFunctionCache();
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('should use the provided namespace and separator', async () => {
    const cache = await getFunctionCache({
      namespace: 'test',
      namespaceSeparator: ':',
    });
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('should use the default namespace separator if none is provided', async () => {
    const cache = await getFunctionCache({ namespace: 'test' });
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });
});
