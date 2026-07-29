import { describe, test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getFrameworkList,
  FRAMEWORKS_MANIFEST_URL,
} from '../src/get-framework-list';
import type { FrameworkManifest } from '../src/interpret';

const pinnedManifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'dist', 'frameworks.json'), 'utf8')
) as FrameworkManifest;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getFrameworkList', () => {
  test('fetches, interprets, and returns Framework objects', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => pinnedManifest,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const list = await getFrameworkList();

    expect(fetchMock).toHaveBeenCalledWith(
      FRAMEWORKS_MANIFEST_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(list.length).toBe(pinnedManifest.length);
    expect(typeof list[0].getOutputDirName).toBe('function');
    expect(list.find(f => f.slug === 'nextjs')?.name).toBe('Next.js');
  });

  test('respects manifestUrl override', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => pinnedManifest.slice(0, 1),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const list = await getFrameworkList({
      manifestUrl: 'https://example.test/v1/frameworks.json',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/v1/frameworks.json',
      expect.anything()
    );
    expect(list).toHaveLength(1);
  });

  test('rejects on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({}),
      }))
    );

    await expect(getFrameworkList()).rejects.toThrow(
      /Failed to fetch frameworks manifest.*503/
    );
  });

  test('rejects on empty manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [],
      }))
    );

    await expect(getFrameworkList()).rejects.toThrow(/empty or not an array/);
  });
});
