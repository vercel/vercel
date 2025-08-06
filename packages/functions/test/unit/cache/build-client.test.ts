import { describe, it, expect, beforeEach, afterEach, Mock, vi } from 'vitest';
import { BuildCache } from '../../../src/cache/build-client';

describe('BuildCache', () => {
  const host = 'localhost';
  const basepath = '';
  const protocol = 'http';
  const endpoint = `${protocol}://${host}${basepath}/v1/build-cache/`;
  const headers = { Auth: 'test-auth' };
  const key = 'test-key';
  const value = { foo: 'bar' };
  let fetchMock: Mock;
  let onError: Mock;
  let cache: BuildCache;

  beforeEach(() => {
    fetchMock = vi.fn();
    onError = vi.fn();
    // @ts-ignore
    global.fetch = fetchMock;
    cache = new BuildCache({
      endpoint,
      headers,
      onError,
    });
  });

  afterEach(() => {
    // @ts-ignore
    delete global.fetch;
  });

  it('should get cache value when status is 200 and cache is fresh', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      headers: { get: () => 'fresh' },
      json: async () => value,
    });
    const result = await cache.get(key);
    expect(result).toEqual(value);
  });

  it('should return null when status is 404', async () => {
    fetchMock.mockResolvedValueOnce({ status: 404 });
    const result = await cache.get(key);
    expect(result).toBeNull();
  });

  it('should return null if cache is not fresh', async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: () => 'stale' },
        json: async () => value,
      })
      .mockResolvedValueOnce({ status: 200 }); // for delete
    const result = await cache.get(key);
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should call onError and return null on get error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fail'));
    const result = await cache.get(key);
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalled();
  });

  it('should set cache value with correct headers', async () => {
    fetchMock.mockResolvedValueOnce({ status: 200 });
    await cache.set(key, value, { ttl: 60, tags: ['a', 'b'], name: 'test' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(key),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-vercel-revalidate': '60',
          'x-vercel-cache-tags': 'a,b',
          'x-vercel-cache-item-name': 'test',
        }),
        body: JSON.stringify(value),
      })
    );
  });

  it('should call onError on set error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fail'));
    await cache.set(key, value);
    expect(onError).toHaveBeenCalled();
  });

  it('should delete cache value', async () => {
    fetchMock.mockResolvedValueOnce({ status: 200 });
    await cache.delete(key);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(key),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('should call onError on delete error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fail'));
    await cache.delete(key);
    expect(onError).toHaveBeenCalled();
  });
});
