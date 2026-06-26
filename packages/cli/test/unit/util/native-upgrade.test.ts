import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { Readable, Writable } from 'stream';
import output from '../../../src/output-manager';
import { fetchLatestVersion } from '../../../src/util/get-latest-version';
import { executeStandaloneUpgrade } from '../../../src/util/native-upgrade';
import pkg from '../../../src/util/pkg';

const mocks = vi.hoisted(() => ({
  chmodSync: vi.fn(),
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
  fetch: vi.fn(),
  realpathSync: vi.fn(),
  rename: vi.fn(),
  rmSync: vi.fn(),
  spawnSync: vi.fn(),
  toNodeReadable: vi.fn(),
}));

vi.mock('child_process', () => ({ spawnSync: mocks.spawnSync }));

vi.mock('fs', async importActual => ({
  ...(await importActual<typeof import('fs')>()),
  chmodSync: mocks.chmodSync,
  createReadStream: mocks.createReadStream,
  createWriteStream: mocks.createWriteStream,
  realpathSync: mocks.realpathSync,
  rmSync: mocks.rmSync,
}));

vi.mock('fs/promises', () => ({ rename: mocks.rename }));

vi.mock('../../../src/output-manager', () => ({
  default: {
    error: vi.fn(),
    log: vi.fn(),
    spinner: vi.fn(),
    stopSpinner: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../../src/util/fetch', () => ({
  default: mocks.fetch,
  toNodeReadable: mocks.toNodeReadable,
}));

vi.mock('../../../src/util/get-latest-version', () => ({
  fetchLatestVersion: vi.fn(),
}));

vi.mock('../../../src/util/native-install', () => ({
  getReleaseTarget: () => 'vercel-test-target',
}));

const fetchLatestVersionMock = vi.mocked(fetchLatestVersion);
const outputMock = vi.mocked(output);

describe('executeStandaloneUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realpathSync.mockReturnValue('/tmp/vercel');
    mocks.createWriteStream.mockReturnValue(
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );
    mocks.spawnSync.mockReturnValue({ status: 0 });
    mocks.rename.mockResolvedValue(undefined);
  });

  it('resolves the native release stream and skips an up-to-date download', async () => {
    fetchLatestVersionMock.mockResolvedValue(pkg.version);

    await expect(executeStandaloneUpgrade()).resolves.toBe(0);

    expect(fetchLatestVersionMock).toHaveBeenCalledWith({
      name: '@vercel/vc-native',
    });
    expect(outputMock.log).toHaveBeenCalledWith(
      `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('fails cleanly when the native release version cannot be resolved', async () => {
    fetchLatestVersionMock.mockResolvedValue(undefined);

    await expect(executeStandaloneUpgrade()).resolves.toBe(1);

    expect(outputMock.error).toHaveBeenCalledWith(
      'Could not determine the latest version to install.'
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('downloads release assets through shared fetch and verifies the checksum', async () => {
    const binary = 'native binary';
    const checksum = createHash('sha256').update(binary).digest('hex');
    mocks.fetch
      .mockResolvedValueOnce(new Response(binary))
      .mockResolvedValueOnce(new Response(`${checksum}  vercel-test-target`));
    mocks.toNodeReadable.mockReturnValue(Readable.from([binary]));
    mocks.createReadStream.mockReturnValue(Readable.from([binary]));

    await expect(executeStandaloneUpgrade('999.0.0')).resolves.toBe(0);

    const base =
      'https://github.com/vercel/vercel/releases/download/vercel@999.0.0/vercel-test-target';
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, base, {
      signal: expect.any(AbortSignal),
    });
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, `${base}.sha256`, {
      signal: expect.any(AbortSignal),
    });
    expect(mocks.chmodSync).toHaveBeenCalledWith(
      `/tmp/.vercel-upgrade-${process.pid}.tmp`,
      0o755
    );
    expect(mocks.rename).toHaveBeenCalledWith(
      `/tmp/.vercel-upgrade-${process.pid}.tmp`,
      '/tmp/vercel'
    );
    expect(outputMock.success).toHaveBeenCalledWith(
      'Vercel CLI has been upgraded to 999.0.0!'
    );
  });

  it('removes the temporary file when a release request fails', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response('not found', { status: 404 })
    );

    await expect(executeStandaloneUpgrade('999.0.0')).resolves.toBe(1);

    expect(mocks.rmSync).toHaveBeenCalledWith(
      `/tmp/.vercel-upgrade-${process.pid}.tmp`,
      { force: true }
    );
    expect(outputMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Request failed (404)')
    );
  });
});
