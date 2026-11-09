import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { setLoadKeyringModuleForTesting } from '@vercel/cli-auth/credentials-store.js';
import { getGlobalPathConfig as getCliConfigGlobalPath } from '@vercel/cli-config';
import getGlobalPathConfig from '../../../../src/util/config/global-path';
import { client } from '../../../mocks/client';
import {
  ISOLATED_DIR_PREFIX,
  assertIsolatedTempDir,
  removeIsolatedDir,
} from '../../../helpers/remove-isolated-dir';

// `vitest.setup.mts` redirects the Vercel CLI global config dir to a temp
// directory for every test file. These tests guard against regressions that
// would let tests overwrite the developer's real `auth.json`.
describe('global config isolation', () => {
  function isolatedGlobalDir(): string {
    const dataHome = process.env.XDG_DATA_HOME;
    if (!dataHome) {
      throw new Error('XDG_DATA_HOME is not set by vitest.setup.mts');
    }
    return join(dataHome, 'com.vercel.cli');
  }

  it('places the isolated data dir under the OS temp dir', () => {
    const rel = relative(tmpdir(), isolatedGlobalDir());
    expect(rel.startsWith('..') || isAbsolute(rel)).toBe(false);
  });

  it('resolves the global config dir inside the isolated data dir', () => {
    expect(getCliConfigGlobalPath()).toBe(isolatedGlobalDir());
    expect(getGlobalPathConfig([])).toBe(isolatedGlobalDir());
  });

  it('writes persisted credentials into the isolated dir without loading the keyring', () => {
    const loadKeyringModule = vi.fn(() => {
      throw new Error('native keyring loaded');
    });
    setLoadKeyringModuleForTesting(loadKeyringModule);
    try {
      // Deliberately omit `skipWrite`, mirroring tests that replace the mock
      // client's auth config wholesale.
      client.authConfig = {
        token: 'vca_isolation',
        refreshToken: 'vcr_isolation',
      };
      client.persistAuthConfig();
    } finally {
      setLoadKeyringModuleForTesting();
    }

    const authPath = join(isolatedGlobalDir(), 'auth.json');
    expect(existsSync(authPath)).toBe(true);
    expect(readFileSync(authPath, 'utf8')).toContain('vca_isolation');
    expect(loadKeyringModule).not.toHaveBeenCalled();
    expect(process.env.VERCEL_TOKEN_STORAGE).toBeUndefined();
    expect(process.env.VERCEL_TEST_KEYRING_UNAVAILABLE).toBe('1');
  });

  it('removes read-only trees such as the Go module cache', () => {
    const dir = mkdtempSync(join(tmpdir(), ISOLATED_DIR_PREFIX));
    const moduleDir = join(dir, 'pkg', 'mod', 'golang.org', 'x', 'text');
    mkdirSync(moduleDir, { recursive: true });
    const file = join(moduleDir, '.gitattributes');
    writeFileSync(file, '*\n');
    chmodSync(file, 0o444);
    chmodSync(moduleDir, 0o555);

    removeIsolatedDir(dir);

    expect(existsSync(dir)).toBe(false);
  });

  it('allows removing missing paths inside an isolated dir', () => {
    const missing = join(tmpdir(), `${ISOLATED_DIR_PREFIX}missing`, 'a', 'b');
    expect(() => removeIsolatedDir(missing)).not.toThrow();
  });

  // Only the assertion runs against paths outside the temp dir, so a broken
  // guard cannot delete anything real.
  it.each([
    ['the OS temp dir itself', tmpdir()],
    ['the home dir', homedir()],
    ['the current working dir', process.cwd()],
    ['the filesystem root', '/'],
    ['an escape via ..', join(tmpdir(), `${ISOLATED_DIR_PREFIX}x`, '..', '..')],
  ])('refuses %s', (_label, dir) => {
    expect(() => assertIsolatedTempDir(dir)).toThrow(/Refusing to remove/);
  });

  it('refuses isolated-looking symlinks that point outside the temp dir', () => {
    const link = join(tmpdir(), `${ISOLATED_DIR_PREFIX}link-${Date.now()}`);
    // 'junction' lets Windows create a directory link without admin rights.
    symlinkSync(process.cwd(), link, 'junction');
    try {
      expect(() => assertIsolatedTempDir(link)).toThrow(/Refusing to remove/);
    } finally {
      rmSync(link, { force: true });
    }
  });

  it('refuses temp dirs without the isolated prefix and leaves them intact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vercel-cli-other-'));
    try {
      expect(() => removeIsolatedDir(dir)).toThrow(/Refusing to remove/);
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
