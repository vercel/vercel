import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
 * Part 1 of 2: no optionalDependencies are wired, so with no native package
 * present the CLI must no-op into JS. When a fake native is installed as a
 * sibling, the CLI spawns it and exits with its exit code.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(here, '..', '..', '..');
const distDir = join(cliRoot, 'dist');
const binName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';

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
      JSON.stringify({ name: pkgName, version: '55.0.0' })
    );
    const binPath = join(pkgDir, 'bin', binName);
    writeFileSync(binPath, opts.body);
    chmodSync(binPath, opts.executable === false ? 0o644 : 0o755);
  }
  return { root, vcJs: join(vercelDist, 'vc.js') };
}

describe('dist/vc.js native resolution (part 1 no-op)', () => {
  it('no-ops to JS when no native package is installed', () => {
    const { vcJs } = buildInstall({
      platform: process.platform,
      arch: process.arch,
    });
    const r = spawnSync(process.execPath, [vcJs, '--version'], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('55.0.0');
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
      });
      expect(r.status).toBe(7);
      expect(r.stdout.trim()).toBe('NATIVE_RAN');
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
      });
      // EACCES fall-through hits the JS --version fast path.
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('55.0.0');
    }
  );
});
