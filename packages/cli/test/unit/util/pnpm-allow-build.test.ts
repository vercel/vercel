import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, existsSync } from 'fs';
import { outputJSON, remove, ensureDir } from 'fs-extra';
import execa from 'execa';

// Real-pnpm integration test for the --allow-build flag that
// getUpdateCommandInfo appends to global pnpm upgrade commands.
//
// pnpm v10+ gates dependency build scripts: interactively it prompts for
// approval, non-interactively it skips them with an "Ignored build scripts"
// warning. These tests run the real pnpm binary against a file: fixture
// package (no registry needed) in a fully isolated state (own store dir,
// temp project outside this repo's workspace) to pin down that behavior and
// prove --allow-build prevents the prompt/skip.

function detectPnpmMajor(): number | undefined {
  try {
    const { stdout } = execa.sync('pnpm', ['--version']);
    return parseInt(stdout.trim().split('.')[0], 10);
  } catch {
    return undefined;
  }
}

const pnpmMajor = detectPnpmMajor();
// The build-script approval gate is a pnpm v10+ behavior
const canRun = pnpmMajor !== undefined && pnpmMajor >= 10;

describe.skipIf(!canRun)('pnpm --allow-build', () => {
  // Real installs; give CI room for first-run store setup
  vi.setConfig({ testTimeout: 120_000 });

  const root = mkdtempSync(join(tmpdir(), 'vc-allow-build-'));
  const depDir = join(root, 'dep');
  const appDir = join(root, 'app');
  const storeDir = join(root, 'store');
  const markerPath = join(appDir, 'node_modules', 'fx-dep', 'marker.txt');

  function runInstall(extraArgs: string[] = []) {
    return execa(
      'pnpm',
      ['add', `fx-dep@file:${depDir}`, `--store-dir=${storeDir}`, ...extraArgs],
      {
        cwd: appDir,
        reject: false,
        all: true,
        // Same shape executeUpgrade uses: no interactive input, captured output
        stdin: 'ignore',
        env: { ...process.env, CI: '' },
        extendEnv: false,
      }
    );
  }

  beforeEach(async () => {
    await remove(appDir);
    await ensureDir(appDir);
    await outputJSON(join(depDir, 'package.json'), {
      name: 'fx-dep',
      version: '1.0.0',
      scripts: {
        // node -e keeps it portable (no `touch` on Windows)
        postinstall: `node -e "require('fs').writeFileSync('marker.txt','ran')"`,
      },
    });
    await outputJSON(join(appDir, 'package.json'), {
      name: 'app',
      version: '1.0.0',
    });
  });

  afterAll(async () => {
    await remove(root);
  });

  it('gates the postinstall script without the flag', async () => {
    const result = await runInstall();

    expect(result.exitCode).toBe(0);
    // The approval gate fired: script skipped, pnpm points at approve-builds
    // (in a TTY this is where the interactive prompt appears)
    expect(result.all).toMatch(/ignored build scripts/i);
    expect(result.all).toMatch(/approve-builds/i);
    expect(existsSync(markerPath)).toBe(false);
  });

  it('runs the postinstall script with --allow-build and never prompts', async () => {
    const result = await runInstall(['--allow-build=fx-dep']);

    expect(result.exitCode).toBe(0);
    expect(result.all).not.toMatch(/ignored build scripts/i);
    expect(existsSync(markerPath)).toBe(true);
  });
});
