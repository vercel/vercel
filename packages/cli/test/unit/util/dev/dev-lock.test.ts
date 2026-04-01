import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol, type fs as fsType } from 'memfs';
import { join } from 'path';
import type { DevLockFile } from '../../../../src/util/dev/dev-lock';

vi.mock('fs', async () => {
  const memfs: { fs: typeof fsType } = await vi.importActual('memfs');
  return {
    ...memfs.fs,
    default: memfs.fs,
  };
});

vi.mock('fs/promises', async () => {
  const memfs: { fs: typeof fsType } = await vi.importActual('memfs');
  return {
    ...memfs.fs.promises,
    default: memfs.fs.promises,
  };
});

vi.mock('../../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
  },
}));

const { acquireDevLock, releaseDevLock } = await import(
  '../../../../src/util/dev/dev-lock'
);

describe('dev-lock', () => {
  const projectRoot = '/test/project';
  const vercelDir = join(projectRoot, '.vercel');
  const lockPath = join(vercelDir, 'dev.lock');

  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(vercelDir, { recursive: true });
  });

  afterEach(() => {
    vol.reset();
  });

  describe('acquireDevLock', () => {
    it('should acquire lock when no lock file exists', async () => {
      const result = await acquireDevLock(projectRoot, 3000);

      expect(result.acquired).toBe(true);

      const lockContent = vol.readFileSync(lockPath, 'utf8') as string;
      const lockData: DevLockFile = JSON.parse(lockContent);

      expect(lockData.pid).toBe(process.pid);
      expect(lockData.port).toBe(3000);
      expect(lockData.cwd).toBe(projectRoot);
      expect(typeof lockData.startedAt).toBe('number');
    });

    it('should fail to acquire lock when held by running process', async () => {
      const existingLock: DevLockFile = {
        pid: process.pid,
        port: 4000,
        startedAt: Date.now() - 60000,
        cwd: projectRoot,
      };
      vol.writeFileSync(lockPath, JSON.stringify(existingLock));

      const result = await acquireDevLock(projectRoot, 3000);

      expect(result.acquired).toBe(false);
      if (!result.acquired && result.existingLock) {
        expect(result.existingLock.pid).toBe(process.pid);
        expect(result.existingLock.port).toBe(4000);
      }
    });

    it('should acquire lock when existing lock is stale (process not running)', async () => {
      const stalePid = 999999;
      const staleLock: DevLockFile = {
        pid: stalePid,
        port: 4000,
        startedAt: Date.now() - 60000,
        cwd: projectRoot,
      };
      vol.writeFileSync(lockPath, JSON.stringify(staleLock));

      const originalKill = process.kill;
      process.kill = vi.fn((pid: number, signal?: string | number) => {
        if (pid === stalePid && signal === 0) {
          const err = new Error('ESRCH') as NodeJS.ErrnoException;
          err.code = 'ESRCH';
          throw err;
        }
        return originalKill.call(process, pid, signal as number);
      }) as typeof process.kill;

      try {
        const result = await acquireDevLock(projectRoot, 3000);

        expect(result.acquired).toBe(true);

        const lockContent = vol.readFileSync(lockPath, 'utf8') as string;
        const lockData: DevLockFile = JSON.parse(lockContent);
        expect(lockData.pid).toBe(process.pid);
        expect(lockData.port).toBe(3000);
      } finally {
        process.kill = originalKill;
      }
    });
  });

  describe('releaseDevLock', () => {
    it('should delete lock file when it exists', async () => {
      const lockData: DevLockFile = {
        pid: process.pid,
        port: 3000,
        startedAt: Date.now(),
        cwd: projectRoot,
      };
      vol.writeFileSync(lockPath, JSON.stringify(lockData));

      releaseDevLock(projectRoot);

      expect(vol.existsSync(lockPath)).toBe(false);
    });

    it('should not throw when lock file does not exist', () => {
      expect(() => releaseDevLock(projectRoot)).not.toThrow();
    });
  });
});
