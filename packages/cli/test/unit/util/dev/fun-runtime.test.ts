import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fun = vi.hoisted(() => ({
  cacheDir: '',
  initializeRuntime: vi.fn(),
}));

vi.mock('@vercel/fun', () => ({
  runtimes: { provided: { name: 'provided', runtimeDir: '/snapshot/x' } },
  initializeRuntime: fun.initializeRuntime,
}));

import { initializeFunRuntime } from '../../../../src/util/dev/fun-runtime';

describe('initializeFunRuntime', () => {
  beforeEach(async () => {
    fun.cacheDir = await mkdtemp(join(tmpdir(), 'fun-runtime-'));
    fun.initializeRuntime.mockImplementation(async runtime => {
      await writeFile(join(fun.cacheDir, 'bootstrap'), '#!/bin/sh\n', {
        mode: 0o644,
      });
      runtime.cacheDir = fun.cacheDir;
      return runtime;
    });
  });

  afterEach(async () => {
    fun.initializeRuntime.mockReset();
    await rm(fun.cacheDir, { recursive: true, force: true });
  });

  // Windows has no POSIX mode bits to check.
  it.skipIf(process.platform === 'win32')(
    'makes the cached launcher executable',
    async () => {
      await initializeFunRuntime('provided');

      expect(fun.initializeRuntime).toHaveBeenCalledTimes(1);
      expect((await stat(join(fun.cacheDir, 'bootstrap'))).mode & 0o777).toBe(
        0o755
      );
    }
  );

  it('leaves an unknown runtime to createFunction', async () => {
    await expect(initializeFunRuntime('nope')).resolves.toBeUndefined();
    expect(fun.initializeRuntime).not.toHaveBeenCalled();
  });
});
