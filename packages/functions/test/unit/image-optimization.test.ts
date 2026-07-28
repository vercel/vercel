import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  optimizeImageFromBytes,
  optimizeImageFromUrl,
} from '../../src/image-optimization';

const makeToken = (claims: Record<string, unknown>) => {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  })}.sig`;
};

const TOKEN = makeToken({ project_id: 'prj_123', owner_id: 'team_123' });

const OPTIMIZED = new Uint8Array([1, 2, 3, 4]);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.VERCEL_OIDC_TOKEN = TOKEN;
  fetchMock = vi.fn(
    async () =>
      new Response(OPTIMIZED, {
        status: 200,
        headers: { 'content-type': 'image/webp' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete process.env.VERCEL_OIDC_TOKEN;
  vi.unstubAllGlobals();
});

describe('optimizeImageFromBytes', () => {
  test('sends bytes with OIDC bearer token and query params', async () => {
    const source = new Uint8Array([9, 9, 9]);
    const result = await optimizeImageFromBytes(source, {
      width: 512,
      quality: 80,
      format: 'webp',
      contentType: 'image/png',
      fileName: 'house.jpg',
    });

    expect(result.data).toEqual(OPTIMIZED);
    expect(result.contentType).toBe('image/webp');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe('https://api.vercel.com');
    expect(parsed.pathname).toBe(
      '/v1/projects/prj_123/image-optimization/optimize-from-bytes'
    );
    expect(parsed.searchParams.get('width')).toBe('512');
    expect(parsed.searchParams.get('quality')).toBe('80');
    expect(parsed.searchParams.get('format')).toBe('image/webp');
    expect(parsed.searchParams.get('fileName')).toBe('house.jpg');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers['content-type']).toBe('image/png');
    expect(init.body).toEqual(source);
  });

  test('defaults quality to 75 and omits format when not provided', async () => {
    await optimizeImageFromBytes(new Uint8Array([1]), { width: 128 });
    const parsed = new URL(String(fetchMock.mock.calls[0][0]));
    expect(parsed.searchParams.get('quality')).toBe('75');
    expect(parsed.searchParams.has('format')).toBe(false);
    expect(parsed.searchParams.has('fileName')).toBe(false);
  });

  test('accepts an ArrayBuffer source', async () => {
    const source = new Uint8Array([7, 8]).buffer;
    await optimizeImageFromBytes(source, { width: 128 });
    expect(fetchMock.mock.calls[0][1].body).toEqual(new Uint8Array([7, 8]));
  });

  test('throws with status and body on upstream error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Payload Too Large', { status: 413 })
    );
    await expect(
      optimizeImageFromBytes(new Uint8Array([1]), { width: 128 })
    ).rejects.toThrow(/413.*Payload Too Large/);
  });

  test('throws when the token has no project_id claim', async () => {
    process.env.VERCEL_OIDC_TOKEN = makeToken({ owner_id: 'team_123' });
    await expect(
      optimizeImageFromBytes(new Uint8Array([1]), { width: 128 })
    ).rejects.toThrow(/project_id/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('optimizeImageFromUrl', () => {
  test('sends the source url as a query param with no body', async () => {
    const result = await optimizeImageFromUrl(
      'https://example.com/logo.png?v=2',
      { width: 512, format: 'avif' }
    );

    expect(result.data).toEqual(OPTIMIZED);

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe(
      '/v1/projects/prj_123/image-optimization/optimize-from-url'
    );
    expect(parsed.searchParams.get('url')).toBe(
      'https://example.com/logo.png?v=2'
    );
    expect(parsed.searchParams.get('format')).toBe('image/avif');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  test('respects VERCEL_IMAGE_OPTIMIZATION_API_URL override', async () => {
    process.env.VERCEL_IMAGE_OPTIMIZATION_API_URL = 'https://api.example.test';
    try {
      await optimizeImageFromUrl('https://example.com/a.png', { width: 64 });
      const parsed = new URL(String(fetchMock.mock.calls[0][0]));
      expect(parsed.origin).toBe('https://api.example.test');
    } finally {
      delete process.env.VERCEL_IMAGE_OPTIMIZATION_API_URL;
    }
  });
});
