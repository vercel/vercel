import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDirectoryLock, withFileLock } from '../../../src/util/file-lock';

function options(waitMs = 1000) {
  return {
    waitMs,
    retryMs: 5,
    busyMessage: (path: string) => `Lock unavailable: ${path}`,
  };
}

describe('withFileLock', () => {
  let directory: string;
  let lock: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vercel-file-lock-'));
    lock = join(directory, 'test.lock');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('serializes actions and removes the lock afterward', async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const order: string[] = [];

    const first = withFileLock(
      lock,
      async () => {
        order.push('first-start');
        await gate;
        order.push('first-end');
      },
      options()
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await access(lock)
          .then(() => true)
          .catch(() => false)
      )
        break;
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    await expect(access(lock)).resolves.toBeUndefined();
    const second = withFileLock(
      lock,
      async () => {
        order.push('second');
      },
      options()
    );

    expect(JSON.parse(await readFile(lock, 'utf8'))).toMatchObject({
      pid: process.pid,
    });
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first-start', 'first-end', 'second']);
    expect(await readdir(directory)).toEqual([]);
  });

  it('releases the lock when the action fails', async () => {
    await expect(
      withFileLock(
        lock,
        async () => {
          throw new Error('action failed');
        },
        options()
      )
    ).rejects.toThrow('action failed');

    expect(await readdir(directory)).toEqual([]);
  });

  it('times out without removing an existing lock', async () => {
    await writeFile(lock, 'existing');

    await expect(
      withFileLock(lock, async () => {}, options(20))
    ).rejects.toThrow(`Lock unavailable: ${lock}`);
    await expect(readFile(lock, 'utf8')).resolves.toBe('existing');
  });
});

// Toggled by the "transient owner-read failure" regression test below. Kept
// outside `describe` so the mock factory (hoisted by vitest) can close over
// it without a hoisting error.
let failNextOwnerRead = false;

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: async (
      ...args: Parameters<typeof actual.readFile>
    ): ReturnType<typeof actual.readFile> => {
      const [path] = args;
      if (failNextOwnerRead && String(path).endsWith('owner.json')) {
        failNextOwnerRead = false;
        throw Object.assign(
          new Error('EBUSY: resource busy or locked, open ' + String(path)),
          { code: 'EBUSY' }
        );
      }
      return actual.readFile(...args);
    },
  };
});

describe('withDirectoryLock', () => {
  let directory: string;
  let lock: string;

  function directoryOptions(waitMs = 1000) {
    return {
      waitMs,
      retryMs: 5,
      abandonedAfterMs: 10_000,
      busyMessage: (path: string) => `Lock unavailable: ${path}`,
    };
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vercel-directory-lock-'));
    lock = join(directory, 'test.lock');
    failNextOwnerRead = false;
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('serializes actions and removes the lock afterward', async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const order: string[] = [];

    const first = withDirectoryLock(
      lock,
      async () => {
        order.push('first-start');
        await gate;
        order.push('first-end');
      },
      directoryOptions()
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await access(lock)
          .then(() => true)
          .catch(() => false)
      )
        break;
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    await expect(access(lock)).resolves.toBeUndefined();
    const second = withDirectoryLock(
      lock,
      async () => {
        order.push('second');
      },
      directoryOptions()
    );

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first-start', 'first-end', 'second']);
    expect(await readdir(directory)).toEqual([]);
  });

  // Regression test for the intermittent Windows CI failure where
  // `native-auto-update.test.ts`'s "serializes concurrent cache writes" test
  // timed out waiting on a lock nobody still held. The release path re-reads
  // `owner.json` to confirm the lock is still ours before removing it. A
  // single transient read error there (e.g. a Windows file-sharing violation
  // from an antivirus scan or search indexer) used to be indistinguishable
  // from "someone else owns this lock now", so the release was silently
  // skipped and the lock was stranded until `abandonedAfterMs` elapsed - far
  // longer than a caller's `waitMs`, producing the observed timeout.
  it('still releases the lock after one transient owner-read failure', async () => {
    failNextOwnerRead = true;
    await withDirectoryLock(
      lock,
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      },
      directoryOptions()
    );

    // The lock must be fully released: nothing left behind under `directory`
    // besides the (empty) `package-updates`-style parent that the caller
    // owns, and a second acquisition must succeed immediately rather than
    // waiting out `abandonedAfterMs`.
    expect(await readdir(directory)).toEqual([]);

    const start = Date.now();
    await withDirectoryLock(lock, async () => {}, directoryOptions());
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('times out without stealing a live lock', async () => {
    const { mkdir, writeFile: writeOwner } =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises'
      );
    await mkdir(lock);
    await writeOwner(
      join(lock, 'owner.json'),
      `${JSON.stringify({ token: 'live', pid: process.pid, createdAt: Date.now() })}\n`
    );

    await expect(
      withDirectoryLock(lock, async () => {}, directoryOptions(20))
    ).rejects.toThrow(`Lock unavailable: ${lock}`);
    await expect(readFile(join(lock, 'owner.json'), 'utf8')).resolves.toContain(
      '"live"'
    );
  });
});
