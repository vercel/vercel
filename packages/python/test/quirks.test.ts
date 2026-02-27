import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';

// Mock execa (used by prisma quirk's run(), not for dependency detection)
vi.mock('execa', () => {
  const fn = vi.fn();
  return { default: fn, __esModule: true };
});

// Mock @vercel/build-utils debug
vi.mock('@vercel/build-utils', () => ({
  debug: vi.fn(),
}));

// Mock getVenvSitePackagesDirs and resolveVendorDir — avoids spawning Python
vi.mock('../src/install', () => ({
  getVenvSitePackagesDirs: vi.fn(),
  resolveVendorDir: vi.fn().mockReturnValue('.vercel/builders/python'),
}));

import execa from 'execa';
import { getVenvSitePackagesDirs } from '../src/install';
import { runQuirks, toposortQuirks } from '../src/quirks';
import { RUNTIME_OPENSSL_VERSION } from '../src/quirks/prisma';
import type { Quirk, QuirkContext } from '../src/quirks';

const mockedExeca = vi.mocked(execa);
const mockedGetSitePackages = vi.mocked(getVenvSitePackagesDirs);

const EXECA_OK = {
  stdout: '',
  stderr: '',
  exitCode: 0,
  command: '',
  escapedCommand: '',
  failed: false,
  timedOut: false,
  killed: false,
} as any;

describe('runQuirks', () => {
  let tmpDir: string;
  let sitePackagesDir: string;

  function makeCtx(): QuirkContext {
    const venvPath = path.join(tmpDir, '.venv');
    return {
      venvPath,
      pythonEnv: { PATH: path.join(venvPath, 'bin') },
      workPath: tmpDir,
    };
  }

  beforeEach(async () => {
    tmpDir = path.join(
      tmpdir(),
      `vc-test-quirks-${Math.floor(Math.random() * 1e6)}`
    );
    const venvPath = path.join(tmpDir, '.venv');
    const binDir = path.join(venvPath, 'bin');
    await fs.mkdirp(binDir);
    await fs.writeFile(path.join(binDir, 'python'), '');

    sitePackagesDir = path.join(venvPath, 'lib', 'python3.12', 'site-packages');
    await fs.mkdirp(sitePackagesDir);

    mockedExeca.mockReset();
    mockedGetSitePackages.mockReset();
    mockedGetSitePackages.mockResolvedValue([sitePackagesDir]);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('skips quirk when dependency is not installed', async () => {
    // No prisma dist-info in site-packages → quirk should be skipped
    const result = await runQuirks(makeCtx());

    expect(result.env).toEqual({});
    expect(result.buildEnv).toEqual({});
    expect(result.alwaysBundlePackages).toEqual([]);
    // No execa calls — prisma quirk's run() was never invoked
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('runs quirk and merges result when dependency is installed', async () => {
    // Create prisma dist-info so scanDistributions detects it
    await fs.mkdirp(path.join(sitePackagesDir, 'prisma'));
    const distInfoDir = path.join(sitePackagesDir, 'prisma-0.13.0.dist-info');
    await fs.mkdirp(distInfoDir);
    await fs.writeFile(
      path.join(distInfoDir, 'METADATA'),
      'Metadata-Version: 2.1\nName: prisma\nVersion: 0.13.0\n'
    );
    await fs.writeFile(
      path.join(distInfoDir, 'RECORD'),
      'prisma/__init__.py,,\n'
    );

    // prisma quirk's run() calls execa for prisma generate — since execa is
    // mocked we need to simulate the engine binary that `prisma generate`
    // would download into the cache's node_modules/prisma/ directory.
    const cacheDir = path.join(sitePackagesDir, 'prisma', '__bincache__');
    const binaryTarget =
      process.arch === 'arm64'
        ? 'query-engine-linux-arm64-openssl-3.0.x'
        : 'query-engine-rhel-openssl-3.0.x';
    const engineDir = path.join(cacheDir, 'node_modules', 'prisma');
    await fs.mkdirp(engineDir);
    await fs.writeFile(path.join(engineDir, binaryTarget), 'fake-engine');

    mockedExeca.mockResolvedValue(EXECA_OK);

    const result = await runQuirks(makeCtx());

    // Verify env vars point to the runtime cache directory
    expect(result.env).toMatchObject({
      PRISMA_BINARY_CACHE_DIR: expect.stringContaining('prisma/__bincache__'),
      VERCEL_RUNTIME_ENV_PATH_PREPEND: expect.stringContaining(
        'prisma/__bincache__'
      ),
    });
    expect(result.buildEnv).toMatchObject({
      PRISMA_BINARY_CACHE_DIR: cacheDir,
    });
    expect(result.alwaysBundlePackages).toEqual(['prisma']);

    // Verify engine binary was renamed to the runtime name
    const runtimeName = `prisma-query-engine-rhel-openssl-${RUNTIME_OPENSSL_VERSION}.x`;
    expect(await fs.pathExists(path.join(cacheDir, runtimeName))).toBe(true);

    // Verify openssl shim was created
    expect(await fs.pathExists(path.join(cacheDir, 'openssl'))).toBe(true);
  });
});

describe('toposortQuirks', () => {
  function makeQuirk(
    dependency: string,
    opts?: { runsBefore?: string[]; runsAfter?: string[] }
  ): Quirk {
    return {
      dependency,
      runsBefore: opts?.runsBefore,
      runsAfter: opts?.runsAfter,
      run: vi.fn().mockResolvedValue({}),
    };
  }

  it('sorts quirk with runsBefore before the referenced quirk', () => {
    const a = makeQuirk('a', { runsBefore: ['b'] });
    const b = makeQuirk('b');
    const sorted = toposortQuirks([b, a]);
    expect(sorted.indexOf(a)).toBeLessThan(sorted.indexOf(b));
  });

  it('sorts quirk with runsAfter after the referenced quirk', () => {
    const a = makeQuirk('a');
    const b = makeQuirk('b', { runsAfter: ['a'] });
    const sorted = toposortQuirks([b, a]);
    expect(sorted.indexOf(a)).toBeLessThan(sorted.indexOf(b));
  });

  it('silently ignores references to non-activated quirks', () => {
    const a = makeQuirk('a', { runsBefore: ['nonexistent'] });
    const b = makeQuirk('b');
    // Should not throw
    const sorted = toposortQuirks([a, b]);
    expect(sorted).toHaveLength(2);
  });

  it('throws on circular dependencies', () => {
    const a = makeQuirk('a', { runsBefore: ['b'] });
    const b = makeQuirk('b', { runsBefore: ['a'] });
    expect(() => toposortQuirks([a, b])).toThrow(/Circular dependency/);
  });
});
