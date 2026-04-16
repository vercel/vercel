import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Client from '../../../../src/util/client';
import { readPublicOpenApiSpecFromCacheOrNetwork } from '../../../../src/util/openapi/fetch-public-openapi-spec';

const { mockedCacheDir } = vi.hoisted(() => {
  return { mockedCacheDir: { value: '' } };
});

vi.mock('xdg-app-paths', () => ({
  default: () => ({
    cache: () => mockedCacheDir.value,
  }),
}));

describe('readPublicOpenApiSpecFromCacheOrNetwork', () => {
  beforeEach(() => {
    mockedCacheDir.value = mkdtempSync(join(tmpdir(), 'vercel-openapi-cache-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(mockedCacheDir.value, { recursive: true, force: true });
  });

  it('uses client.fetch when a client is provided', async () => {
    const clientFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"openapi":"3.1.0"}',
    });
    const client = { fetch: clientFetch } as unknown as Client;

    const globalFetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('global fetch should not be called'));

    const result = await readPublicOpenApiSpecFromCacheOrNetwork(true, client);

    expect('raw' in result).toBe(true);
    if ('raw' in result) {
      expect(result.raw).toContain('"openapi":"3.1.0"');
    }
    expect(clientFetch).toHaveBeenCalledOnce();
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to global fetch when no client is provided', async () => {
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"openapi":"3.1.0"}',
    } as Response);

    const result = await readPublicOpenApiSpecFromCacheOrNetwork(true);

    expect('raw' in result).toBe(true);
    expect(globalFetchSpy).toHaveBeenCalledOnce();
  });
});
