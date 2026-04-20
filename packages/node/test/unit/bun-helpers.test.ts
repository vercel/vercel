import { describe, expect, test, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const execMock = vi.fn();
const downloadToMock = vi.fn();
const extractZipMock = vi.fn();
const chmodMock = vi.fn();
const renameMock = vi.fn();
const mkdirMock = vi.fn();
const mkdtempMock = vi.fn();
const rmMock = vi.fn();

vi.mock('node:child_process', () => {
  return {
    spawn: (...args: unknown[]) => {
      execMock(args[0], args[1], args[2]);
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', currentExitCode, null));
      return child;
    },
  };
});

vi.mock('@vercel/build-utils', () => {
  class VerifiedDownloader {
    sha256: string;
    constructor(options: { sha256: string }) {
      this.sha256 = options.sha256;
    }
    downloadTo(url: string, destFile: string) {
      return downloadToMock(url, destFile);
    }
  }
  return {
    VerifiedDownloader,
    extractZip: (...args: unknown[]) => extractZipMock(...args),
    debug: () => {},
  };
});

vi.mock('node:fs/promises', () => ({
  chmod: (...args: unknown[]) => chmodMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  mkdtemp: (...args: unknown[]) => mkdtempMock(...args),
  rename: (...args: unknown[]) => renameMock(...args),
  rm: (...args: unknown[]) => rmMock(...args),
}));

let currentExitCode = 0;

beforeEach(async () => {
  currentExitCode = 0;
  execMock.mockReset();
  downloadToMock.mockReset();
  extractZipMock.mockReset();
  chmodMock.mockReset();
  renameMock.mockReset();
  mkdirMock.mockReset();
  mkdtempMock.mockReset();
  rmMock.mockReset();

  downloadToMock.mockResolvedValue(undefined);
  extractZipMock.mockResolvedValue(undefined);
  chmodMock.mockResolvedValue(undefined);
  renameMock.mockResolvedValue(undefined);
  mkdirMock.mockResolvedValue(undefined);
  mkdtempMock.mockResolvedValue('/tmp/bun-install-mock');
  rmMock.mockResolvedValue(undefined);

  // Ensure no cached module state between tests.
  vi.resetModules();
});

describe('getOrCreateBunBinary', () => {
  test('returns the cached binary without invoking the downloader if already on PATH', async () => {
    const { getOrCreateBunBinary } = await import('../../src/bun-helpers');
    currentExitCode = 0;

    const result = await getOrCreateBunBinary();

    expect(result).toMatch(/^bun(\.exe)?$/);
    expect(downloadToMock).not.toHaveBeenCalled();
    expect(extractZipMock).not.toHaveBeenCalled();
  });

  test('downloads, verifies, and extracts Bun when not found on PATH', async () => {
    // First two spawn calls are --version probes that fail; third is the final
    // probe that succeeds.
    const exits = [1, 1, 0];
    let call = 0;
    execMock.mockImplementation(() => {
      currentExitCode = exits[Math.min(call++, exits.length - 1)];
    });

    const { getOrCreateBunBinary } = await import('../../src/bun-helpers');
    const result = await getOrCreateBunBinary();

    expect(downloadToMock).toHaveBeenCalledTimes(1);
    const [url, destFile] = downloadToMock.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/github\.com\/oven-sh\/bun\/releases\/download\/bun-v/
    );
    expect(destFile).toEqual(expect.stringContaining('bun-'));

    expect(extractZipMock).toHaveBeenCalledTimes(1);
    expect(extractZipMock.mock.calls[0][2]).toEqual({ strip: 1 });

    expect(renameMock).toHaveBeenCalled();
    expect(result).toContain('.bun');
  });

  test('throws a clear error when the download fails', async () => {
    execMock.mockImplementation(() => {
      currentExitCode = 1;
    });
    downloadToMock.mockRejectedValueOnce(new Error('sha mismatch'));

    const { getOrCreateBunBinary } = await import('../../src/bun-helpers');
    await expect(getOrCreateBunBinary()).rejects.toThrow(
      /Failed to install Bun/
    );
  });
});
