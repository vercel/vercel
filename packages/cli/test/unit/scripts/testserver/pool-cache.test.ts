import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  acquirePoolLock,
  adoptPendingSandboxes,
  checkCachedSandboxes,
  poolPaths,
  readPoolCache,
  triageCachedSandboxes,
  writePendingSandboxes,
  writePoolCache,
} from '../../../../scripts/testserver/pool-cache.mjs';

describe('acquirePoolLock()', () => {
  let dir: string;
  let lockPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'testserver-lock-'));
    lockPath = join(dir, 'pool.lock');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('takes a free lock and releases it', () => {
    const lock = acquirePoolLock(lockPath, process.pid);
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(process.pid));
    lock.release?.();
    expect(acquirePoolLock(lockPath, process.pid).release).toBeDefined();
  });

  test('reports a lock held by a live process', () => {
    // This test's own process is alive; take the lock as a different pid.
    writeFileSync(lockPath, `${process.pid}\n`);
    expect(acquirePoolLock(lockPath, process.pid + 1)).toEqual({
      heldBy: process.pid,
    });
  });

  test('replaces a lock left by a dead process', () => {
    // Above the default pid_max on Linux and macOS, so never a live process.
    writeFileSync(lockPath, '99999999\n');
    const lock = acquirePoolLock(lockPath, process.pid);
    expect(lock.release).toBeDefined();
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(process.pid));
  });

  test('replaces a lock with no live pid, and leaves no temp files', () => {
    writeFileSync(lockPath, '');
    expect(acquirePoolLock(lockPath, process.pid).release).toBeDefined();
    expect(readdirSync(dir)).toEqual(['pool.lock']);
  });

  test('leaves no temp files when the lock is held', () => {
    writeFileSync(lockPath, `${process.pid}\n`);
    acquirePoolLock(lockPath, process.pid + 1);
    expect(readdirSync(dir)).toEqual(['pool.lock']);
  });

  test('a delayed stale remover leaves a replacement live owner alone', () => {
    writeFileSync(lockPath, '99999999\n');
    const live = new Set([101, 102, 103]);
    const options = { isPidAlive: (pid: number) => live.has(pid) };
    let replacement: ReturnType<typeof acquirePoolLock> | undefined;

    const delayed = acquirePoolLock(lockPath, 101, {
      isPidAlive: pid => {
        if (pid === 99999999) {
          // A paused after reading the old pid. B reclaims it and starts
          // using the pool before A acts on that stale observation.
          replacement = acquirePoolLock(lockPath, 102, options);
          expect(replacement.release).toBeDefined();
          return false;
        }
        return live.has(pid);
      },
    });

    expect(delayed).toEqual({ heldBy: 102 });
    expect(readFileSync(lockPath, 'utf8')).toBe('102\n');
    expect(acquirePoolLock(lockPath, 103, options)).toEqual({ heldBy: 102 });
    expect(readdirSync(dir)).toEqual(['pool.lock']);
    replacement?.release?.();
  });

  test('only one reclaimer can remove a stale lock', () => {
    writeFileSync(lockPath, '99999999\n');
    const options = { isPidAlive: (pid: number) => pid !== 99999999 };
    let contender: ReturnType<typeof acquirePoolLock> | undefined;

    const owner = acquirePoolLock(lockPath, 101, {
      isPidAlive: pid => {
        if (existsSync(`${lockPath}.reclaim`)) {
          // Pause after the guarded read. A second reclaimer must not
          // remove the file while the first still has permission to do so.
          contender = acquirePoolLock(lockPath, 102, options);
          expect(readFileSync(lockPath, 'utf8')).toBe('99999999\n');
        }
        return options.isPidAlive(pid);
      },
    });

    expect(contender).toEqual({ heldBy: undefined });
    expect(owner.release).toBeDefined();
    expect(acquirePoolLock(lockPath, 102, options)).toEqual({ heldBy: 101 });
    expect(readdirSync(dir)).toEqual(['pool.lock']);
    owner.release?.();
  });

  test.each([
    102, 103,
  ])('preserves a replacement with pid %i when the observed owner releases and exits during the guarded check', replacementPid => {
    writeFileSync(lockPath, '99999999\n');
    const live = new Set([101, 102, 103]);
    const options = { isPidAlive: (pid: number) => live.has(pid) };
    let original: ReturnType<typeof acquirePoolLock> | undefined;
    let replacement: ReturnType<typeof acquirePoolLock> | undefined;
    let replaced = false;

    const delayed = acquirePoolLock(lockPath, 101, {
      isPidAlive: pid => {
        if (pid === 99999999) {
          original = acquirePoolLock(lockPath, 102, options);
          expect(original.release).toBeDefined();
          return false;
        }
        if (pid === 102 && !replaced) {
          expect(existsSync(`${lockPath}.reclaim`)).toBe(true);
          original?.release?.();
          live.delete(102);
          // The liveness check observes the old owner's death. Before
          // the remover resumes, a new process takes the lock. Include
          // PID reuse: matching text is not proof of file identity.
          live.add(replacementPid);
          replacement = acquirePoolLock(lockPath, replacementPid, options);
          expect(replacement.release).toBeDefined();
          replaced = true;
          return false;
        }
        return live.has(pid);
      },
    });

    expect(replaced).toBe(true);
    expect(delayed).toEqual({ heldBy: replacementPid });
    expect(readFileSync(lockPath, 'utf8')).toBe(`${replacementPid}\n`);
    expect(readdirSync(dir)).toEqual(['pool.lock']);
    replacement?.release?.();
  });

  test('does not steal an abandoned reclamation guard', () => {
    writeFileSync(lockPath, '99999999\n');
    mkdirSync(`${lockPath}.reclaim`);
    expect(acquirePoolLock(lockPath)).toEqual({ heldBy: undefined });
    expect(readFileSync(lockPath, 'utf8')).toBe('99999999\n');
    expect(existsSync(`${lockPath}.reclaim`)).toBe(true);
  });

  test('an abandoned guard does not block free-lock acquisition or release', () => {
    mkdirSync(`${lockPath}.reclaim`);
    const owner = acquirePoolLock(lockPath);
    expect(owner.release).toBeDefined();
    owner.release?.();
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(`${lockPath}.reclaim`)).toBe(true);
  });

  test('an unexpected pid-probe error is not proof of death', () => {
    // Outside process.kill()'s PID range: it throws rather than reporting
    // ESRCH. Do not treat that error as permission to remove the lock.
    writeFileSync(lockPath, '999999999999\n');
    expect(acquirePoolLock(lockPath)).toEqual({ heldBy: 999999999999 });
    expect(readFileSync(lockPath, 'utf8')).toBe('999999999999\n');
  });

  test('propagates read errors instead of removing an unreadable lock', () => {
    mkdirSync(lockPath);
    expect(() => acquirePoolLock(lockPath)).toThrow();
    expect(existsSync(lockPath)).toBe(true);
    expect(readdirSync(dir)).toEqual(['pool.lock']);
  });

  test('releases the reclamation guard when the guarded check fails', () => {
    writeFileSync(lockPath, '99999999\n');
    const failure = new Error('liveness check failed');
    expect(() =>
      acquirePoolLock(lockPath, 101, {
        isPidAlive: () => {
          if (existsSync(`${lockPath}.reclaim`)) throw failure;
          return false;
        },
      })
    ).toThrow(failure);
    expect(readdirSync(dir)).toEqual(['pool.lock']);
    expect(acquirePoolLock(lockPath).release).toBeDefined();
  });

  test('release is idempotent even after this process reacquires the lock', () => {
    const first = acquirePoolLock(lockPath);
    first.release?.();
    const second = acquirePoolLock(lockPath);
    expect(second.release).toBeDefined();
    first.release?.();
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(process.pid));
    second.release?.();
    expect(existsSync(lockPath)).toBe(false);
  });

  test("release leaves another process's lock alone", () => {
    const lock = acquirePoolLock(lockPath, process.pid);
    writeFileSync(lockPath, '12345\n');
    lock.release?.();
    expect(readFileSync(lockPath, 'utf8').trim()).toBe('12345');
  });
});

// pool.mjs registers the lock's release with signal-exit. These run that in
// a real process, against real signals, alone and next to the other users of
// the same signals. Windows has no POSIX signals to send.
describe.skipIf(process.platform === 'win32')(
  'releasing the pool lock with signal-exit',
  () => {
    const cliRequire = createRequire(
      join(__dirname, '../../../../package.json')
    );
    const url = (path: string) => JSON.stringify(pathToFileURL(path).href);
    let dir: string;
    let lockPath: string;
    let strays: number[];
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'testserver-signal-'));
      lockPath = join(dir, 'pool.lock');
      strays = [];
    });
    afterEach(() => {
      for (const pid of strays) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already gone, as it should be.
        }
      }
      rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Start a process that takes the lock and registers its release as
     * pool.mjs does, then runs `body`. Resolves once it prints its first
     * line, a JSON object, with that object and a promise of its exit.
     */
    async function lockedProcess(body: string[]) {
      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          [
            `import { acquirePoolLock } from ${url(join(__dirname, '../../../../scripts/testserver/pool-cache.mjs'))};`,
            `import onExit from ${url(cliRequire.resolve('signal-exit'))};`,
            `import execa from ${url(cliRequire.resolve('execa'))};`,
            `const lock = acquirePoolLock(${JSON.stringify(lockPath)});`,
            'onExit(lock.release);',
            ...body,
            'setInterval(() => {}, 1000);',
          ].join('\n'),
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] }
      );
      const exited = new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>(resolve =>
        child.on('exit', (code, signal) => resolve({ code, signal }))
      );
      const ready = await new Promise<Record<string, number>>(
        (resolve, reject) => {
          child.stdout.once('data', chunk =>
            resolve(JSON.parse(String(chunk).split('\n')[0]))
          );
          child.on('error', reject);
          void exited.then(() => reject(new Error('exited before locking')));
        }
      );
      expect(existsSync(lockPath)).toBe(true);
      return { child, ready, exited };
    }

    function alive(pid: number) {
      try {
        process.kill(pid, 0);
      } catch {
        return false;
      }
      // A killed orphan stays a zombie until its new parent reaps it, and
      // kill(pid, 0) succeeds on a zombie. Where PID 1 doesn't reap, as in
      // a container without an init, it stays one, so read its state.
      if (process.platform !== 'linux') return true;
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        return stat.slice(stat.lastIndexOf(')') + 2)[0] !== 'Z';
      } catch {
        return false;
      }
    }

    test('a process killed by SIGTERM leaves no lock', async () => {
      const { child, exited } = await lockedProcess(['console.log("{}");']);
      child.kill('SIGTERM');

      expect(await exited).toEqual({ code: null, signal: 'SIGTERM' });
      expect(existsSync(lockPath)).toBe(false);
    });

    test('SIGTERM during an execa child, as in a laptop build, kills both and leaves no lock', async () => {
      const { child, ready, exited } = await lockedProcess([
        "const build = execa(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);",
        'build.catch(() => {});',
        'console.log(JSON.stringify({ build: build.pid }));',
      ]);
      strays.push(ready.build);
      child.kill('SIGTERM');

      expect(await exited).toEqual({ code: null, signal: 'SIGTERM' });
      expect(existsSync(lockPath)).toBe(false);
      await vi.waitFor(() => expect(alive(ready.build)).toBe(false));
    });

    test('a handler that owns the signal releases through its process.exit()', async () => {
      const { child, exited } = await lockedProcess([
        // Like runInSandbox(): stop the runner first, then exit.
        "process.on('SIGTERM', () => setTimeout(() => process.exit(143), 50));",
        'console.log("{}");',
      ]);
      child.kill('SIGTERM');

      expect(await exited).toEqual({ code: 143, signal: null });
      expect(existsSync(lockPath)).toBe(false);
    });
  }
);

describe('poolPaths()', () => {
  test('keeps the cache, its lock and the pending files in one directory', () => {
    // Compare with native separators: join() yields `\` on Windows.
    const dir = join('/repo', 'node_modules', '.cache', 'testserver');
    const { cache, lock, pending } = poolPaths(dir);
    expect([cache, lock, pending].map(p => dirname(p))).toEqual([
      dir,
      dir,
      dir,
    ]);
    expect([cache, lock, pending].map(p => basename(p))).toEqual([
      'sandboxes.json',
      'sandboxes.json.lock',
      'pending',
    ]);
  });
});

describe('pending sandboxes', () => {
  // Above the default pid_max on Linux and macOS, so never a live process.
  const DEAD_PID = 99999999;
  const maxAgeMs = 300 * 60_000;
  let dir: string;
  let cachePath: string;
  let pendingDir: string;
  const sandbox = (n: number) => ({
    testserver: `https://sb-${n}.vercel.run`,
    created: '2026-01-01T00:00:00.000Z',
    ttl: 18000,
  });
  const cached = () => JSON.parse(readFileSync(cachePath, 'utf8')).sandboxes;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'testserver-pending-'));
    ({ cache: cachePath, pending: pendingDir } = poolPaths(dir));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("writePendingSandboxes() replaces the run's pending file", () => {
    writePendingSandboxes([sandbox(1)], pendingDir, DEAD_PID);
    writePendingSandboxes([sandbox(1), sandbox(2)], pendingDir, DEAD_PID);
    expect(readPoolCache(join(pendingDir, `${DEAD_PID}.json`))).toEqual([
      sandbox(1),
      sandbox(2),
    ]);
  });

  test('writePendingSandboxes() writes nothing for no sandboxes', () => {
    writePendingSandboxes([], pendingDir, DEAD_PID);
    expect(existsSync(pendingDir)).toBe(false);
  });

  test("adopts a dead run's sandboxes into the cache and deletes its file", () => {
    writePoolCache([sandbox(1)], cachePath);
    writePendingSandboxes([sandbox(1), sandbox(2)], pendingDir, DEAD_PID);
    expect(adoptPendingSandboxes(cachePath, pendingDir, { maxAgeMs })).toBe(1);
    expect(cached()).toEqual([sandbox(1), sandbox(2)]);
    expect(readdirSync(pendingDir)).toEqual([]);
  });

  test('creates the cache when there is none', () => {
    writePendingSandboxes([sandbox(3)], pendingDir, DEAD_PID);
    expect(adoptPendingSandboxes(cachePath, pendingDir, { maxAgeMs })).toBe(1);
    expect(cached()).toEqual([sandbox(3)]);
  });

  test("leaves a live run's sandboxes alone", () => {
    // The parent process is alive and isn't this one.
    writePendingSandboxes([sandbox(2)], pendingDir, process.ppid);
    expect(adoptPendingSandboxes(cachePath, pendingDir, { maxAgeMs })).toBe(0);
    expect(existsSync(cachePath)).toBe(false);
    expect(readdirSync(pendingDir)).toEqual([`${process.ppid}.json`]);
  });

  test('adopts a file older than maxAgeMs even when its pid is alive again', () => {
    writePendingSandboxes([sandbox(2)], pendingDir, process.ppid);
    const old = (Date.now() - maxAgeMs - 60_000) / 1000;
    utimesSync(join(pendingDir, `${process.ppid}.json`), old, old);
    expect(adoptPendingSandboxes(cachePath, pendingDir, { maxAgeMs })).toBe(1);
    expect(readdirSync(pendingDir)).toEqual([]);
  });

  test('ignores other files and a missing pending directory', () => {
    expect(adoptPendingSandboxes(cachePath, pendingDir, { maxAgeMs })).toBe(0);
    mkdirSync(pendingDir);
    writeFileSync(join(pendingDir, 'notes.txt'), 'x');
    expect(adoptPendingSandboxes(cachePath, pendingDir, { maxAgeMs })).toBe(0);
    expect(readdirSync(pendingDir)).toEqual(['notes.txt']);
  });
});

describe('triageCachedSandboxes()', () => {
  // A cached config created `ageMinutes` ago with a `ttlMinutes` TTL.
  const cached = (name: string, ageMinutes: number, ttlMinutes = 300) => ({
    testserver: `https://${name}.run`,
    created: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
    ttl: ttlMinutes * 60,
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('uses live sandboxes with time left, freshest first', () => {
    const older = cached('older', 200);
    const fresher = cached('fresher', 10);
    const { usable, retained } = triageCachedSandboxes([
      { config: older, alive: true },
      { config: fresher, alive: true },
    ]);
    expect(usable).toEqual([fresher, older]);
    expect(retained).toEqual([]);
  });

  test('keeps a sandbox that failed its health check but has time left', () => {
    // One slow health check must not drop a sandbox with hours left.
    const slow = cached('slow', 10);
    const { usable, retained } = triageCachedSandboxes([
      { config: slow, alive: false },
    ]);
    expect(usable).toEqual([]);
    expect(retained).toEqual([slow]);
  });

  test('drops a failed sandbox that expires too soon to use', () => {
    const { usable, retained } = triageCachedSandboxes([
      { config: cached('expiring', 290), alive: false },
      { config: cached('expired', 400), alive: false },
    ]);
    expect(usable).toEqual([]);
    expect(retained).toEqual([]);
  });

  test('drops sandboxes with no created/ttl, alive or not', () => {
    const { usable, retained } = triageCachedSandboxes([
      { config: { testserver: 'https://a.run' }, alive: true },
      { config: { testserver: 'https://b.run' }, alive: false },
    ]);
    expect(usable).toEqual([]);
    expect(retained).toEqual([]);
  });

  test('drops a live sandbox that expires too soon to use', () => {
    const { usable, retained } = triageCachedSandboxes([
      { config: cached('expiring', 290), alive: true },
    ]);
    expect(usable).toEqual([]);
    expect(retained).toEqual([]);
  });
});

describe('pool cache file', () => {
  let dir: string;
  let cachePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'testserver-cache-'));
    cachePath = join(dir, 'nested', 'testserver_sandboxes.json');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('round-trips the sandboxes', () => {
    const sandboxes = [{ testserver: 'https://a.run', ttl: 18_000 }];
    writePoolCache(sandboxes, cachePath);
    expect(readPoolCache(cachePath)).toEqual(sandboxes);
  });

  test('reads a missing or corrupt cache as empty', () => {
    expect(readPoolCache(cachePath)).toEqual([]);
    writePoolCache([], cachePath);
    writeFileSync(cachePath, '{not json');
    expect(readPoolCache(cachePath)).toEqual([]);
  });

  test('skips entries without a testserver URL', () => {
    writePoolCache([], cachePath);
    writeFileSync(
      cachePath,
      JSON.stringify({ sandboxes: [{ testserver: 'https://a.run' }, {}, 3] })
    );
    expect(readPoolCache(cachePath)).toEqual([{ testserver: 'https://a.run' }]);
  });

  test('checkCachedSandboxes() returns nothing for an empty cache', async () => {
    expect(await checkCachedSandboxes(cachePath)).toEqual({
      usable: [],
      retained: [],
      checkMs: 0,
    });
  });
});
