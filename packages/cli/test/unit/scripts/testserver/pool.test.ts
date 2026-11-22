import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createSandboxes,
  exactSandboxCount,
  fallbackTarget,
  resolveSandboxes,
  sandboxTarget,
} from '../../../../scripts/testserver/pool.mjs';
import {
  poolPaths,
  readPoolCache,
  writePendingSandboxes,
  writePoolCache,
} from '../../../../scripts/testserver/pool-cache.mjs';

const { createTestserver, onExit } = vi.hoisted(() => ({
  createTestserver: vi.fn(),
  onExit: vi.fn(),
}));

vi.mock('signal-exit', () => ({ default: onExit }));

vi.mock(
  '../../../../scripts/testserver/create-testserver.mjs',
  async importOriginal => ({
    ...(await importOriginal()),
    createTestserver,
    getTrustedOidcToken: () => 'token',
  })
);

describe('exactSandboxCount()', () => {
  test('is undefined when unset or empty, so the count follows the files', () => {
    expect(exactSandboxCount({})).toBeUndefined();
    expect(exactSandboxCount({ TESTSERVER_SANDBOX_COUNT: '' })).toBeUndefined();
    expect(
      exactSandboxCount({ TESTSERVER_SANDBOX_COUNT: '  ' })
    ).toBeUndefined();
  });

  test('returns the requested count, above the default maximum too', () => {
    expect(exactSandboxCount({ TESTSERVER_SANDBOX_COUNT: '8' })).toBe(8);
    expect(exactSandboxCount({ TESTSERVER_SANDBOX_COUNT: ' 12 ' })).toBe(12);
  });

  test('rejects values that are not positive integers', () => {
    for (const value of ['0', '-1', '2.5', 'eight']) {
      expect(() =>
        exactSandboxCount({ TESTSERVER_SANDBOX_COUNT: value })
      ).toThrow('TESTSERVER_SANDBOX_COUNT must be a positive integer');
    }
  });
});

describe('sandboxTarget()', () => {
  test('wants one sandbox per 4 test files', () => {
    expect(sandboxTarget(1, 8).count).toBe(1);
    expect(sandboxTarget(4, 8).count).toBe(1);
    expect(sandboxTarget(5, 8).count).toBe(2);
    expect(sandboxTarget(10, 8)).toEqual({
      count: 3,
      reason: '10 test files, 4 per sandbox',
    });
  });

  test('caps at the maximum', () => {
    expect(sandboxTarget(32, 8).count).toBe(8);
    expect(sandboxTarget(500, 8)).toEqual({
      count: 8,
      reason: '500 test files, 4 per sandbox, capped at 8',
    });
  });

  test('uses one sandbox when no test files match', () => {
    expect(sandboxTarget(0, 8).count).toBe(1);
  });
});

describe('fallbackTarget()', () => {
  test('uses the live cached sandboxes, up to the maximum', () => {
    expect(fallbackTarget(3, 8).count).toBe(3);
    expect(fallbackTarget(12, 8).count).toBe(8);
  });

  test('creates one sandbox when none are cached', () => {
    expect(fallbackTarget(0, 8)).toEqual({
      count: 1,
      reason: 'test files not counted; one sandbox',
    });
  });
});

describe('createSandboxes()', () => {
  test('reports each sandbox as soon as it exists', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let finishSecond: (config: { testserver: string }) => void = () => {};
    const second = new Promise<{ testserver: string }>(resolve => {
      finishSecond = resolve;
    });
    const create = vi
      .fn()
      .mockResolvedValueOnce({ testserver: 'https://first.run' })
      .mockReturnValueOnce(second);
    const onCreated = vi.fn();

    const done = createSandboxes(2, { token: 'token', onCreated, create });

    // The first sandbox is reported while the second is still being created,
    // so an interrupted run has already cached it.
    await vi.waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        testserver: 'https://first.run',
      })
    );
    expect(onCreated).toHaveBeenCalledTimes(1);

    finishSecond({ testserver: 'https://second.run' });
    const { created, errors } = await done;
    expect(onCreated).toHaveBeenCalledTimes(2);
    expect(created.map(c => c.testserver)).toEqual([
      'https://first.run',
      'https://second.run',
    ]);
    expect(errors).toEqual([]);
  });

  test('a failed creation reports nothing and is returned as an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('boom');
    const create = vi
      .fn()
      .mockResolvedValueOnce({ testserver: 'https://ok.run' })
      .mockRejectedValueOnce(failure);
    const onCreated = vi.fn();

    const { created, errors } = await createSandboxes(2, {
      token: 'token',
      onCreated,
      create,
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(created).toEqual([{ testserver: 'https://ok.run' }]);
    expect(errors).toEqual([failure]);
  });

  test('a sandbox whose caching fails still counts as created', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue({ testserver: 'https://ok.run' });
    const onCreated = vi.fn(() => {
      throw new Error('disk full');
    });

    const { created, errors } = await createSandboxes(1, {
      token: 'token',
      onCreated,
      create,
    });
    expect(created).toEqual([{ testserver: 'https://ok.run' }]);
    expect(errors).toEqual([]);
  });
});

describe('resolveSandboxes()', () => {
  // Above the default pid_max on Linux and macOS, so never a live process.
  const DEAD_PID = 99999999;
  let dir: string;
  let pool: ReturnType<typeof poolPaths>;
  const created = new Date().toISOString();
  const sandbox = (n: number) => ({
    testserver: `https://sb-${n}.vercel.run`,
    created,
    ttl: 18_000,
  });
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'testserver-resolve-'));
    pool = poolPaths(dir);
    createTestserver.mockReset();
    onExit.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  test('records uncached sandboxes in a pending file while another run holds the pool', async () => {
    writePoolCache([sandbox(1)], pool.cache);
    writeFileSync(pool.lock, `${process.ppid}\n`);
    createTestserver
      .mockResolvedValueOnce(sandbox(2))
      .mockResolvedValueOnce(sandbox(3));

    const result = await resolveSandboxes(['vitest', 'run'], 2, pool);

    expect(result).toEqual({
      sandboxes: [sandbox(2), sandbox(3)],
      reused: 0,
      created: 2,
    });
    expect(readPoolCache(pool.cache)).toEqual([sandbox(1)]);
    expect(readFileSync(pool.lock, 'utf8').trim()).toBe(String(process.ppid));
    // Recorded as they were created, with no exit handler to lose on a signal.
    expect(readPoolCache(join(pool.pending, `${process.pid}.json`))).toEqual([
      sandbox(2),
      sandbox(3),
    ]);
    expect(onExit).not.toHaveBeenCalled();
  });

  test("adopts a dead run's pending sandboxes before choosing which to reuse", async () => {
    writePoolCache([sandbox(1)], pool.cache);
    writePendingSandboxes([sandbox(2)], pool.pending, DEAD_PID);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }))
    );

    const result = await resolveSandboxes(['vitest', 'run'], 2, pool);

    expect(result.reused).toBe(2);
    expect(result.created).toBe(0);
    expect(createTestserver).not.toHaveBeenCalled();
    expect(readPoolCache(pool.cache)).toEqual([sandbox(1), sandbox(2)]);
    expect(onExit).toHaveBeenCalledTimes(1);
    onExit.mock.calls[0][0]();
    expect(() => readFileSync(pool.lock)).toThrow();
  });
});
