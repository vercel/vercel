import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join, relative } from 'path';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

// Two full fixture builds (sequential + parallel) with real pnpm/uv installs.
vi.setConfig({ testTimeout: 10 * 60 * 1000 });

const flakey =
  process.platform === 'win32' && process.version.startsWith('v22');

const SERVICES = ['frontend', 'api-a', 'api-b', 'py-a', 'py-b'];

/**
 * Build a fresh temp copy of the workspace fixture with the given
 * `VERCEL_BUILD_CONCURRENCY`, returning its `.vercel/output` directory.
 */
async function buildFixture(concurrency: string): Promise<string> {
  const cwd = setupUnitFixture('commands/build/with-services-parallel');
  // `build()` sets this recursion guard; clear it so this test can build the
  // fixture more than once (once per concurrency level).
  delete process.env.__VERCEL_BUILD_RUNNING;
  process.env.VERCEL_BUILD_CONCURRENCY = concurrency;
  try {
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode, `build with concurrency ${concurrency}`).toBe(0);
  } finally {
    delete process.env.VERCEL_BUILD_CONCURRENCY;
  }
  return join(cwd, '.vercel', 'output');
}

/**
 * Collect the raw text of the top-level and every per-service `config.json`,
 * keyed by output-relative path. Raw text (not parsed JSON) so key order and
 * route order count — the determinism guarantee is byte-identical configs.
 */
async function collectConfigs(output: string): Promise<Record<string, string>> {
  const configs: Record<string, string> = {
    'config.json': await fs.readFile(join(output, 'config.json'), 'utf8'),
  };
  for (const name of SERVICES) {
    const path = join(output, 'services', name, 'config.json');
    if (await fs.pathExists(path)) {
      configs[relative(output, path)] = await fs.readFile(path, 'utf8');
    }
  }
  return configs;
}

/** Recursively search `dir` for any file whose content contains `needle`. */
async function treeContains(dir: string, needle: string): Promise<boolean> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await treeContains(path, needle)) return true;
    } else if (entry.isFile()) {
      try {
        const content = await fs.readFile(path, 'utf8');
        if (content.includes(needle)) return true;
      } catch {
        // binary/unreadable file — skip
      }
    }
  }
  return false;
}

describe.skipIf(flakey)('build --parallel (VERCEL_BUILD_CONCURRENCY)', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
  });

  it('builds a workspace monorepo of services in parallel with output identical to sequential', async () => {
    // Parallel build: 1 vite frontend + 2 Node APIs sharing a pnpm workspace
    // (with a shared JS lib) + 2 Python services sharing a uv workspace (with
    // a shared py lib). The JS builds share one install scope (their pnpm
    // installs mutate the workspace root) and must serialize installs; same
    // for the Python pair.
    const parallelOutput = await buildFixture('4');

    // Every service was recorded and produced output.
    const config = await fs.readJSON(join(parallelOutput, 'config.json'));
    const serviceNames = (config.services ?? [])
      .map((s: { name: string }) => s.name)
      .sort();
    expect(serviceNames).toEqual([...SERVICES].sort());
    for (const name of SERVICES) {
      expect(
        await fs.pathExists(join(parallelOutput, 'services', name)),
        `services/${name} output exists`
      ).toBe(true);
    }

    // The workspace-shared libraries were installed and bundled into the
    // functions — this fails if workspace linking or the install broke.
    expect(
      await treeContains(
        join(parallelOutput, 'services', 'api-a'),
        'via js-shared'
      ),
      'api-a bundles js-shared'
    ).toBe(true);
    // Python functions don't copy files into the .func directory — they
    // reference the per-service venv through `.vc-config.json`'s
    // `filePathMap` (bundle path → project-relative source path). Assert the
    // workspace lib was installed into the venv and mapped into the bundle,
    // and that the mapped source is the real module.
    const pyVcConfig = await fs.readJSON(
      join(
        parallelOutput,
        'services',
        'py-a',
        'functions',
        'index.func',
        '.vc-config.json'
      )
    );
    const pySharedSource = (
      pyVcConfig.filePathMap as Record<string, string> | undefined
    )?.['_vendor/py_shared/__init__.py'];
    expect(pySharedSource, 'py-a maps py_shared into its bundle').toBeDefined();
    const fixtureRoot = join(parallelOutput, '..', '..');
    expect(
      await fs.readFile(join(fixtureRoot, pySharedSource!), 'utf8'),
      'mapped py_shared source is the workspace lib'
    ).toContain('via py-shared');

    // Determinism: a sequential build of the same fixture must
    // produce byte-identical top-level and per-service configs.
    const sequentialOutput = await buildFixture('1');
    const parallelConfigs = await collectConfigs(parallelOutput);
    const sequentialConfigs = await collectConfigs(sequentialOutput);
    expect(Object.keys(parallelConfigs).sort()).toEqual(
      Object.keys(sequentialConfigs).sort()
    );
    for (const [path, sequentialContent] of Object.entries(sequentialConfigs)) {
      expect(
        parallelConfigs[path],
        `${path} identical across concurrency`
      ).toBe(sequentialContent);
    }
  });
});
