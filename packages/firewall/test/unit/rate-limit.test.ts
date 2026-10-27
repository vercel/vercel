import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { checkRateLimit, unstable_checkRateLimit } from '../../src';

const options = {
  headers: { host: 'example.com', 'x-real-ip': '192.0.2.1' },
};

describe.each([
  ['checkRateLimit', checkRateLimit],
  ['unstable_checkRateLimit', unstable_checkRateLimit],
] as const)('%s timeout', (_name, check) => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test('defaults to no timeout', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(check('test-rule', options)).resolves.toEqual({
      rateLimited: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeUndefined();
  });

  test.each([0, 20])('aborts a pending fetch after %i ms', async timeout => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('Expected a timeout signal'));
            return;
          }
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        })
    );

    await expect(
      check('test-rule', { ...options, timeout })
    ).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  test.each([
    [204, { rateLimited: false }],
    [429, { rateLimited: true }],
    [403, { rateLimited: true, error: 'blocked' }],
    [404, { rateLimited: false, error: 'not-found' }],
  ])('handles HTTP %i before the timeout', async (status, result) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response(null, { status }));

    await expect(
      check('test-rule', { ...options, timeout: 1000 })
    ).resolves.toEqual(result);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
  });

  test('propagates fetch errors before the timeout', async () => {
    const error = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(error);

    await expect(
      check('test-rule', { ...options, timeout: 1000 })
    ).rejects.toBe(error);
  });

  test.each([-1, 1.5])('rejects an invalid timeout of %s', async timeout => {
    await expect(check('test-rule', { ...options, timeout })).rejects.toThrow(
      RangeError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
