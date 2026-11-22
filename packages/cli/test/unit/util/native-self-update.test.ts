import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { ReadableStream } from 'node:stream/web';
import { isAbsolute, join, resolve, sep } from 'path';
import {
  getPrBinaryBaseUrl,
  isCurlInstall,
  missingPrPlatformMessage,
  parsePrTarget,
  resolveLatestNativeVersion,
  stageProductionUpdate,
} from '../../../src/util/native-self-update';
import { getInstallRoot } from '../../../src/util/native-install';
import {
  activateSlot,
  readNativeInstallState,
  writeTrackSlot,
} from '../../../src/util/native-install-layout';

describe('curl-based native install detection', () => {
  const originalVercelVcNative = process.env.VERCEL_VC_NATIVE;
  const originalInstallDir = process.env.VERCEL_INSTALL_DIR;
  const originalExecPath = process.execPath;
  // `resolve()` so the path gains a drive letter on Windows, matching what
  // `getInstallRoot()` returns after it resolves VERCEL_INSTALL_DIR.
  const installRoot = resolve(join(sep, 'home', 'user', '.vercel'));

  beforeEach(() => {
    process.env.VERCEL_INSTALL_DIR = installRoot;
  });

  afterEach(() => {
    if (originalVercelVcNative === undefined) {
      delete process.env.VERCEL_VC_NATIVE;
    } else {
      process.env.VERCEL_VC_NATIVE = originalVercelVcNative;
    }
    if (originalInstallDir === undefined) {
      delete process.env.VERCEL_INSTALL_DIR;
    } else {
      process.env.VERCEL_INSTALL_DIR = originalInstallDir;
    }
    Object.defineProperty(process, 'execPath', {
      value: originalExecPath,
      configurable: true,
    });
  });

  function setExecPath(value: string) {
    Object.defineProperty(process, 'execPath', {
      value,
      configurable: true,
    });
  }

  it('detects a curl install when running from a track slot', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    setExecPath(
      join(installRoot, 'versions', 'tracks', 'production', 'a', 'vercel')
    );

    expect(await isCurlInstall()).toBe(true);
  });

  it('recognizes a legacy curl path for detection only', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    setExecPath(join(installRoot, 'versions', '58.0.0', 'vercel'));

    expect(await isCurlInstall()).toBe(true);
  });

  it('is not a curl install when running the JS CLI', async () => {
    delete process.env.VERCEL_VC_NATIVE;
    setExecPath(join(installRoot, 'versions', '58.0.0', 'vercel'));

    expect(await isCurlInstall()).toBe(false);
  });

  it('is not a curl install for a package-manager native binary', async () => {
    process.env.VERCEL_VC_NATIVE = '1';
    setExecPath(
      join(
        sep,
        'usr',
        'local',
        'lib',
        'node_modules',
        '@vercel',
        'vc-native-linux-x64',
        'bin',
        'vercel'
      )
    );

    expect(await isCurlInstall()).toBe(false);
  });
});

describe('native update requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not wait for a failed registry response body to cancel', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel,
          start() {},
        }),
        { status: 500 }
      )
    );

    await expect(resolveLatestNativeVersion()).rejects.toThrow(
      'Failed to fetch package metadata from the npm registry (HTTP 500)'
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('passes an abort signal to registry discovery', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ version: '60.0.0' })));

    await expect(
      resolveLatestNativeVersion({ signal: controller.signal })
    ).resolves.toBe('60.0.0');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/latest$/), {
      signal: controller.signal,
    });
  });
});

describe.skipIf(process.platform === 'win32')(
  'automatic production staging',
  () => {
    const originalInstallDir = process.env.VERCEL_INSTALL_DIR;
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'vercel-native-stage-'));
      process.env.VERCEL_INSTALL_DIR = root;
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
      if (originalInstallDir === undefined) {
        delete process.env.VERCEL_INSTALL_DIR;
      } else {
        process.env.VERCEL_INSTALL_DIR = originalInstallDir;
      }
    });

    async function seedNewerProduction() {
      const slot = await writeTrackSlot(
        root,
        { track: 'production', version: '61.0.0' },
        async directory => {
          await writeFile(join(directory, 'vercel'), 'binary');
        }
      );
      await activateSlot(root, 'production', slot);
      return slot;
    }

    it('does not wait for a failed binary response body to cancel', async () => {
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          new ReadableStream({
            cancel,
            start() {},
          }),
          { status: 500 }
        )
      );

      await expect(stageProductionUpdate('60.0.0')).rejects.toThrow(
        'Failed to download'
      );
      expect(cancel).toHaveBeenCalledOnce();
      expect(await readdir(root)).not.toContain('update.lock');
    });

    it('aborts a binary response that does not finish', async () => {
      let markRequestStarted: (() => void) | undefined;
      const requestStarted = new Promise<void>(resolveStarted => {
        markRequestStarted = resolveStarted;
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        markRequestStarted?.();
        return new Response(
          new ReadableStream({
            start() {},
          })
        );
      });
      const controller = new AbortController();

      const update = stageProductionUpdate('60.0.0', false, {
        signal: controller.signal,
      });
      await requestStarted;
      controller.abort();

      await expect(update).rejects.toMatchObject({ name: 'AbortError' });
      expect(await readNativeInstallState(root)).toBeUndefined();
      expect(await readdir(root)).not.toContain('update.lock');
      const trackEntries = await readdir(
        join(root, 'versions', 'tracks', 'production')
      );
      expect(trackEntries.filter(name => name.startsWith('.slot-'))).toEqual(
        []
      );
    });

    it('activates the first slot update for a legacy curl install', async () => {
      const slot = await writeTrackSlot(
        root,
        { track: 'production', version: '60.0.0' },
        async directory => {
          await writeFile(join(directory, 'vercel'), 'binary');
        }
      );

      const result = await stageProductionUpdate('60.0.0', false);

      expect(result).toEqual({ slot, downloaded: false, activated: true });
      expect((await readNativeInstallState(root))?.version).toBe('60.0.0');
    });

    it('keeps a newer production slot when retrying stale metadata', async () => {
      const slot = await seedNewerProduction();

      const result = await stageProductionUpdate('60.0.0', false);

      expect(result).toEqual({ slot, downloaded: false, activated: true });
      expect((await readNativeInstallState(root))?.version).toBe('61.0.0');
    });

    it('keeps a newer production slot for a delayed explicit check', async () => {
      const slot = await seedNewerProduction();

      const result = await stageProductionUpdate('60.0.0', true);

      expect(result).toEqual({ slot, downloaded: false, activated: true });
      expect((await readNativeInstallState(root))?.version).toBe('61.0.0');
    });
  }
);

describe('getInstallRoot', () => {
  const originalInstallDir = process.env.VERCEL_INSTALL_DIR;

  afterEach(() => {
    if (originalInstallDir === undefined) {
      delete process.env.VERCEL_INSTALL_DIR;
    } else {
      process.env.VERCEL_INSTALL_DIR = originalInstallDir;
    }
  });

  it('normalizes a relative VERCEL_INSTALL_DIR to an absolute path', () => {
    // Symlink targets under `bin/` are stored verbatim; a relative install
    // root would make them resolve relative to `bin/` and break the links.
    process.env.VERCEL_INSTALL_DIR = join('some', 'relative', '.vercel');

    const root = getInstallRoot();
    expect(isAbsolute(root)).toBe(true);
    expect(root).toBe(resolve('some', 'relative', '.vercel'));
  });

  it('uses the canonical platform data directory by default', async () => {
    delete process.env.VERCEL_INSTALL_DIR;
    const { getDataPath } = await import('@vercel/cli-config');

    expect(getInstallRoot()).toBe(getDataPath());
  });
});

describe('getPrBinaryBaseUrl', () => {
  it('uses the commit-scoped binary directory', () => {
    expect(getPrBinaryBaseUrl(115, 'a'.repeat(40))).toBe(
      `https://api-frameworks.vercel.sh/pr-binaries/115/shas/${'a'.repeat(40)}`
    );
  });
});

describe('missingPrPlatformMessage', () => {
  it('says the SHA exists when this platform is not ready yet', () => {
    const sha = `${'abcdef012345'}${'0'.repeat(28)}`;
    expect(missingPrPlatformMessage(115, sha)).toBe(
      `Couldn't find a ${process.platform}-${process.arch} binary for PR #115 (abcdef012345). ` +
        `This SHA exists, but this platform isn't ready yet.`
    );
  });
});

describe('parsePrTarget', () => {
  it('parses pr/<number>', () => {
    expect(parsePrTarget('pr/115')).toBe(115);
  });

  it('parses pr-<number>', () => {
    expect(parsePrTarget('pr-7')).toBe(7);
  });

  it('is case-insensitive', () => {
    expect(parsePrTarget('PR/115')).toBe(115);
  });

  it('rejects regular versions', () => {
    expect(parsePrTarget('58.7.0')).toBeUndefined();
    expect(parsePrTarget('latest')).toBeUndefined();
  });

  it('rejects zero, negatives, and junk', () => {
    expect(parsePrTarget('pr/0')).toBeUndefined();
    expect(parsePrTarget('pr/-1')).toBeUndefined();
    expect(parsePrTarget('pr/abc')).toBeUndefined();
    expect(parsePrTarget('pr/115/extra')).toBeUndefined();
  });
});
