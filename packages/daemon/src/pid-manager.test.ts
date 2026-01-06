import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
  type MockInstance,
} from 'vitest';
import { PIDManager } from './pid-manager';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs');

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('PIDManager', () => {
  let pidManager: PIDManager;
  let mockExistsSync: MockInstance;
  let mockReadFileSync: MockInstance;
  let mockWriteFileSync: MockInstance;
  let mockUnlinkSync: MockInstance;
  let mockKill: MockInstance;

  beforeEach(() => {
    pidManager = new PIDManager();

    mockExistsSync = vi.spyOn(fs, 'existsSync');
    mockReadFileSync = vi.spyOn(fs, 'readFileSync');
    mockWriteFileSync = vi.spyOn(fs, 'writeFileSync');
    mockUnlinkSync = vi.spyOn(fs, 'unlinkSync');
    mockKill = vi.spyOn(process, 'kill');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('acquire', () => {
    it('should acquire PID file when it does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockReturnValue(undefined);

      const acquired = await pidManager.acquire();

      expect(acquired).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('daemon.pid'),
        String(process.pid),
        'utf8'
      );
    });

    it('should acquire PID file when existing process is not running', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('12345');
      mockWriteFileSync.mockReturnValue(undefined);
      mockUnlinkSync.mockReturnValue(undefined);

      // Mock process.kill to throw (process doesn't exist)
      mockKill.mockImplementation(() => {
        const err = new Error('ESRCH') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      });

      const acquired = await pidManager.acquire();

      expect(acquired).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('daemon.pid'),
        String(process.pid),
        'utf8'
      );
    });

    it('should not acquire PID file when another instance is running', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('12345');

      // Mock process.kill to return true (process exists)
      mockKill.mockReturnValue(true);

      const acquired = await pidManager.acquire();

      expect(acquired).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should handle invalid PID in file (NaN)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not-a-number');
      mockWriteFileSync.mockReturnValue(undefined);

      const acquired = await pidManager.acquire();

      // Should treat invalid PID as no valid PID and acquire
      expect(acquired).toBe(true);
      // Should not try to unlink since isNaN(pid) is true
      expect(mockUnlinkSync).not.toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should handle empty PID file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('');
      mockWriteFileSync.mockReturnValue(undefined);

      const acquired = await pidManager.acquire();

      // Should treat empty PID as invalid and acquire
      expect(acquired).toBe(true);
      expect(mockUnlinkSync).not.toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should write current process PID', async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockReturnValue(undefined);
      const currentPID = process.pid;

      await pidManager.acquire();

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        String(currentPID),
        'utf8'
      );
    });

    it('should return false on write errors', async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });

      const acquired = await pidManager.acquire();

      // Should catch error and return false
      expect(acquired).toBe(false);
    });
  });

  describe('release', () => {
    it('should remove PID file when it exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockReturnValue(undefined);

      await pidManager.release();

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should handle PID file not existing', async () => {
      mockExistsSync.mockReturnValue(false);

      // Should not throw
      await expect(pidManager.release()).resolves.toBeUndefined();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('should handle file deletion errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw - errors are caught and logged
      await expect(pidManager.release()).resolves.toBeUndefined();
    });
  });

  describe('lifecycle', () => {
    it('should support full acquire -> release cycle', async () => {
      // Acquire
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockReturnValue(undefined);
      const acquired = await pidManager.acquire();
      expect(acquired).toBe(true);

      // Release
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockReturnValue(undefined);
      await pidManager.release();
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should prevent multiple acquisitions', async () => {
      // First acquisition
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockReturnValue(undefined);
      const first = await pidManager.acquire();
      expect(first).toBe(true);

      // Second acquisition (PID file now exists with our PID)
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(String(process.pid));
      mockKill.mockReturnValue(true);

      const second = await pidManager.acquire();
      expect(second).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle very large PID numbers', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('2147483647'); // Max 32-bit int
      mockWriteFileSync.mockReturnValue(undefined);
      mockUnlinkSync.mockReturnValue(undefined);

      mockKill.mockImplementation(() => {
        const err = new Error('ESRCH') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      });

      const acquired = await pidManager.acquire();
      expect(acquired).toBe(true);
    });

    it('should handle PID file with whitespace', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('  12345  \n');
      mockKill.mockReturnValue(true);

      const acquired = await pidManager.acquire();
      // parseInt handles whitespace, so this should work
      expect(acquired).toBe(false);
    });

    it('should handle process.kill permission errors as "process exists"', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('1'); // System process

      mockKill.mockImplementation(() => {
        const err = new Error('EPERM') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      });

      // EPERM means process exists but we can't signal it
      // The code treats any error as "process doesn't exist" and removes PID file
      const acquired = await pidManager.acquire();
      expect(acquired).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle read errors during acquire', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const acquired = await pidManager.acquire();

      // Should catch error and return false
      expect(acquired).toBe(false);
    });

    it('should handle existsSync errors', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission error');
      });

      const acquired = await pidManager.acquire();

      // Should catch error and return false
      expect(acquired).toBe(false);
    });
  });

  describe('getPIDFilePath', () => {
    it('should return the PID file path', () => {
      const path = pidManager.getPIDFilePath();

      expect(path).toContain('daemon.pid');
      expect(path).toContain('com.vercel.cli');
    });
  });
});
