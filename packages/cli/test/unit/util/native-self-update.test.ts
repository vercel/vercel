import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join, sep } from 'path';
import {
  getInstallRoot,
  getPrBinaryBaseUrl,
  isCurlInstall,
  parsePrTarget,
} from '../../../src/util/native-self-update';
import { isAbsolute, resolve } from 'path';

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

  it('detects a curl install when running from the versions dir', async () => {
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

  it('returns an absolute default when VERCEL_INSTALL_DIR is unset', () => {
    delete process.env.VERCEL_INSTALL_DIR;
    expect(isAbsolute(getInstallRoot())).toBe(true);
  });
});

describe('getPrBinaryBaseUrl', () => {
  it('uses the commit-scoped binary directory', () => {
    expect(getPrBinaryBaseUrl(115, 'a'.repeat(40))).toBe(
      `https://api-frameworks.vercel.sh/pr-binaries/115/shas/${'a'.repeat(40)}`
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
