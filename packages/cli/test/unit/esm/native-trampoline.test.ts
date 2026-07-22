import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

/**
 * Behavioral tests for the native-resolution logic in `dist/vc.js`.
 *
 * These spawn the real built CLI as a subprocess inside a production-like
 * install layout (vercel + @vercel/vc-native-* as siblings in node_modules),
 * so they exercise the actual `resolveNative()` + `spawnSync()` code — not a
 * re-implementation.
 *
 * In production, `createRequire(import.meta.url)` inside `dist/vc.js` is
 * anchored at `node_modules/vercel/dist/vc.js` and resolves the native
 * package by walking up to `node_modules/@vercel/vc-native-*`. The test
 * mirrors that topology so resolution behaves identically.
 *
 * When no native package is present the trampoline no-ops into JS. When a
 * fake native is installed as a sibling, the CLI spawns it and exits with
 * its exit code. Falling through to JS on EACCES must not leave
 * VERCEL_VC_NATIVE=1 set (otherwise the version banner would claim
 * "(native)" while JS is running).
 */

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(here, '..', '..', '..');
const distDir = join(cliRoot, 'dist');
const binName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
const cliVersion = JSON.parse(
  readFileSync(join(cliRoot, 'package.json'), 'utf8')
).version as string;

// Build a production-like install layout in a temp dir:
//   tmp/node_modules/vercel/dist/vc.js (+ version.mjs)
//   tmp/node_modules/@vercel/vc-native-{platform}-{arch}/bin/vercel
function buildInstall(opts: {
  platform: string;
  arch: string;
  body?: string;
  executable?: boolean;
}) {
  const root = mkdtempSync(join(tmpdir(), 'vc-install-'));
  const nm = join(root, 'node_modules');
  // Copy the built CLI so createRequire is anchored at a vercel/dist path,
  // exactly like a real install.
  const vercelDist = join(nm, 'vercel', 'dist');
  mkdirSync(vercelDist, { recursive: true });
  copyFileSync(join(distDir, 'vc.js'), join(vercelDist, 'vc.js'));
  if (existsSync(join(distDir, 'version.mjs'))) {
    copyFileSync(join(distDir, 'version.mjs'), join(vercelDist, 'version.mjs'));
  }

  if (opts.body) {
    const pkgName = `@vercel/vc-native-${opts.platform}-${opts.arch}`;
    const pkgDir = join(nm, pkgName);
    mkdirSync(join(pkgDir, 'bin'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: pkgName, version: cliVersion })
    );
    const binPath = join(pkgDir, 'bin', binName);
    writeFileSync(binPath, opts.body);
    chmodSync(binPath, opts.executable === false ? 0o644 : 0o755);
  }
  return { root, vcJs: join(vercelDist, 'vc.js') };
}

// Strip VITEST/NODE_PATH vars so require.resolve inside the temp vc.js
// doesn't leak the repo's pnpm store (which on main currently has no
// optionalDep but will once part 2 lands).
function cleanEnv() {
  const {
    NODE_PATH: _np,
    NODE_OPTIONS: _no,
    VITEST: _v,
    VITEST_POOL_ID: _vp,
    ...rest
  } = process.env as Record<string, string | undefined>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rest)) if (v != null) out[k] = v;
  return out;
}

describe('dist/vc.js native resolution', () => {
  it('no-ops to JS when no native package is installed', () => {
    const { vcJs } = buildInstall({
      platform: process.platform,
      arch: process.arch,
    });
    const r = spawnSync(process.execPath, [vcJs, '--version'], {
      encoding: 'utf8',
      env: cleanEnv(),
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(cliVersion);
    expect(r.stderr).not.toContain('(native)');
  });

  it.runIf(process.platform !== 'win32')(
    'spawns the native binary and exits with its exit code',
    () => {
      const { vcJs } = buildInstall({
        platform: process.platform,
        arch: process.arch,
        body: '#!/bin/sh\necho NATIVE_RAN\nexit 7\n',
      });
      const r = spawnSync(process.execPath, [vcJs, '--version'], {
        encoding: 'utf8',
        env: cleanEnv(),
      });
      expect(r.status).toBe(7);
      expect(r.stdout.trim()).toBe('NATIVE_RAN');
    }
  );

  it.runIf(process.platform !== 'win32')(
    'does not trampoline again when VERCEL_VC_NATIVE=1 (loop guard)',
    () => {
      const { vcJs } = buildInstall({
        platform: process.platform,
        arch: process.arch,
        body: '#!/bin/sh\necho NATIVE_RAN\nexit 7\n',
      });
      const r = spawnSync(process.execPath, [vcJs, '--version'], {
        encoding: 'utf8',
        env: { ...cleanEnv(), VERCEL_VC_NATIVE: '1' },
      });
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(cliVersion);
      expect(r.stdout).not.toContain('NATIVE_RAN');
    }
  );

  it.runIf(process.platform !== 'win32')(
    'ignores a native package resolved via NODE_PATH',
    () => {
      const { vcJs } = buildInstall({
        platform: process.platform,
        arch: process.arch,
      });
      // A second install holds the native package; expose it via NODE_PATH.
      const other = buildInstall({
        platform: process.platform,
        arch: process.arch,
        body: '#!/bin/sh\necho NATIVE_RAN\nexit 7\n',
      });
      const r = spawnSync(process.execPath, [vcJs, '--version'], {
        encoding: 'utf8',
        env: { ...cleanEnv(), NODE_PATH: join(other.root, 'node_modules') },
      });
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(cliVersion);
      expect(r.stdout).not.toContain('NATIVE_RAN');
      expect(r.stderr).not.toContain('(native)');
    }
  );

  it.runIf(process.platform !== 'win32')(
    'falls through to JS when the native binary is not executable',
    () => {
      const { vcJs } = buildInstall({
        platform: process.platform,
        arch: process.arch,
        body: '#!/bin/sh\necho NATIVE_RAN\nexit 7\n',
        executable: false,
      });
      const r = spawnSync(process.execPath, [vcJs, '--version'], {
        encoding: 'utf8',
        env: cleanEnv(),
      });
      // EACCES fall-through hits the JS --version fast path. Must not be
      // mislabeled as native — VERCEL_VC_NATIVE must be cleared on fallback.
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(cliVersion);
      expect(r.stderr).not.toContain('(native)');
    }
  );
});
