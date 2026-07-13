import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

/**
 * Validates the native-resolution logic in `src/vc.js` (copied to
 * `dist/vc.js` at build time). Part 1 of the native-first rollout: no
 * optionalDependencies are wired, so resolveNative() must return null in a
 * normal install and the CLI no-ops into the existing JS CLI. Part 2 will
 * wire the release flow to publish natives, activating the spawn path.
 */

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const vcSrc = await readFile(join(cliRoot, 'src', 'vc.js'), 'utf8');

// Re-implement resolveNative against a fake package root so we can exercise
// the resolution logic without a real native package on disk.
function resolveNative(opts: { root: string; platform: string; arch: string }) {
  const pkgName = `@vercel/vc-native-${opts.platform}-${opts.arch}`;
  const binName = opts.platform === 'win32' ? 'vercel.exe' : 'vercel';
  const require = createRequire(join(opts.root, 'package.json'));
  try {
    const dir = dirname(require.resolve(`${pkgName}/package.json`));
    const a = join(dir, 'bin', binName);
    if (existsSync(a)) return a;
    const b = join(dir, binName);
    if (existsSync(b)) return b;
  } catch {}
  return null;
}

describe('src/vc.js native resolution (part 1 no-op)', () => {
  it('contains the native-first spawn + JS fallback logic', () => {
    expect(vcSrc).toContain('resolveNative');
    expect(vcSrc).toContain('spawnSync');
    // Falls through to the JS CLI via a relative import (no absolute path
    // that would break on Windows with ERR_UNSUPPORTED_ESM_URL_SCHEME).
    expect(vcSrc).toContain("await import('./index.js')");
  });

  it('does not use pathToFileURL (not needed with a relative import)', () => {
    expect(vcSrc).not.toContain('pathToFileURL');
  });

  it('no-ops to JS when no native package is installed', () => {
    // A normal install has no @vercel/vc-native-* optional dep in part 1,
    // so resolveNative() must return null and the CLI runs as JS.
    const root = mkdtempSync(join(tmpdir(), 'vc-native-test-'));
    expect(
      resolveNative({ root, platform: process.platform, arch: process.arch })
    ).toBeNull();
  });

  it('resolves a native binary when the package layout exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'vc-native-test-'));
    const pkgDir = join(
      root,
      'node_modules',
      '@vercel',
      'vc-native-darwin-arm64'
    );
    mkdirSync(join(pkgDir, 'bin'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      '{"name":"@vercel/vc-native-darwin-arm64"}'
    );
    writeFileSync(join(pkgDir, 'bin', 'vercel'), '');
    const result = resolveNative({ root, platform: 'darwin', arch: 'arm64' });
    expect(result).not.toBeNull();
    expect(result).toContain('vercel');
  });

  it('uses vercel.exe bin name on win32', () => {
    const root = mkdtempSync(join(tmpdir(), 'vc-native-test-'));
    const pkgDir = join(root, 'node_modules', '@vercel', 'vc-native-win32-x64');
    mkdirSync(join(pkgDir, 'bin'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      '{"name":"@vercel/vc-native-win32-x64"}'
    );
    writeFileSync(join(pkgDir, 'bin', 'vercel.exe'), '');
    const result = resolveNative({ root, platform: 'win32', arch: 'x64' });
    expect(result).not.toBeNull();
    expect(result).toMatch(/vercel\.exe$/);
  });
});
