import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCollectVersionContext = vi.hoisted(() => vi.fn());

vi.mock(
  '../../../../src/util/telemetry/version-context',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/util/telemetry/version-context')
      >();
    return {
      ...actual,
      collectVersionContextForTelemetry: mockCollectVersionContext,
    };
  }
);

import { collectCachedVersionContextForTelemetry } from '../../../../src/util/telemetry/version-context-cache';

const detectedContext = {
  status: 'resolved' as const,
  source: 'detected' as const,
  runtime: 'node' as const,
  manager: 'package-manager' as const,
  packageManager: 'pnpm' as const,
  packageManagerAssumed: false,
  global: true,
};

describe('collectCachedVersionContextForTelemetry', () => {
  let directory: string;
  let cacheFilePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vercel-version-context-'));
    cacheFilePath = join(directory, 'telemetry-version-context.json');
    mockCollectVersionContext.mockReset();
    mockCollectVersionContext.mockResolvedValue(detectedContext);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reuses fresh context for the same installation', async () => {
    await expect(
      collectCachedVersionContextForTelemetry({
        cacheFilePath,
        installationKey: 'installation-a',
        now: () => 100,
      })
    ).resolves.toEqual(detectedContext);

    await expect(
      collectCachedVersionContextForTelemetry({
        cacheFilePath,
        installationKey: 'installation-a',
        now: () => 101,
      })
    ).resolves.toEqual({ ...detectedContext, source: 'cache' });
    expect(mockCollectVersionContext).toHaveBeenCalledOnce();
  });

  it('refreshes stale context', async () => {
    await collectCachedVersionContextForTelemetry({
      cacheFilePath,
      installationKey: 'installation-a',
      maxAgeMs: 10,
      now: () => 100,
    });
    await collectCachedVersionContextForTelemetry({
      cacheFilePath,
      installationKey: 'installation-a',
      maxAgeMs: 10,
      now: () => 111,
    });

    expect(mockCollectVersionContext).toHaveBeenCalledTimes(2);
  });

  it('keeps contexts separate for different installations', async () => {
    await collectCachedVersionContextForTelemetry({
      cacheFilePath,
      installationKey: 'installation-a',
      now: () => 100,
    });
    await collectCachedVersionContextForTelemetry({
      cacheFilePath,
      installationKey: 'installation-b',
      now: () => 101,
    });

    expect(mockCollectVersionContext).toHaveBeenCalledTimes(2);
    const cache = await readFile(cacheFilePath, 'utf8');
    expect(cache).toContain('installation-a');
    expect(cache).toContain('installation-b');
  });

  it('deduplicates concurrent collection for the same installation', async () => {
    let resolveDetection: (value: typeof detectedContext) => void = () => {};
    mockCollectVersionContext.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveDetection = resolve;
        })
    );

    const first = collectCachedVersionContextForTelemetry({
      cacheFilePath,
      installationKey: 'installation-a',
      now: () => 100,
    });
    await vi.waitFor(() =>
      expect(mockCollectVersionContext).toHaveBeenCalledOnce()
    );
    const second = collectCachedVersionContextForTelemetry({
      cacheFilePath,
      installationKey: 'installation-a',
      now: () => 100,
    });
    resolveDetection(detectedContext);

    await expect(Promise.all([first, second])).resolves.toEqual([
      detectedContext,
      { ...detectedContext, source: 'cache' },
    ]);
    expect(mockCollectVersionContext).toHaveBeenCalledOnce();
  });

  it('briefly caches cancelled collection to avoid repeated expensive work', async () => {
    mockCollectVersionContext.mockResolvedValue({
      status: 'cancelled',
      source: 'detected',
    });

    await expect(
      collectCachedVersionContextForTelemetry({
        cacheFilePath,
        installationKey: 'installation-a',
        now: () => 100,
      })
    ).resolves.toEqual({ status: 'cancelled', source: 'detected' });
    await expect(
      collectCachedVersionContextForTelemetry({
        cacheFilePath,
        installationKey: 'installation-a',
        now: () => 101,
      })
    ).resolves.toEqual({ status: 'cancelled', source: 'cache' });

    expect(mockCollectVersionContext).toHaveBeenCalledOnce();
  });
});
