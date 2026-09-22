import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertTargetsMatchHost,
  collectReachablePackages,
  getBinaryOnlyDependencies,
  getRuntimeDependencies,
  getTargets,
  platformForTarget,
  pruneNodeModules,
} from '../../../scripts/build-binary.mjs';

describe('getRuntimeDependencies()', () => {
  it('excludes package.json#builders from the runtime set', () => {
    const { runtime, builders } = getRuntimeDependencies({
      dependencies: {
        '@vercel/build-utils': 'workspace:*',
        '@vercel/node': 'workspace:*',
        zod: '4.1.11',
      },
      builders: {
        '@vercel/node': 'workspace:*',
      },
    });

    expect(runtime).toEqual({
      '@vercel/build-utils': 'workspace:*',
      zod: '4.1.11',
    });
    expect([...builders]).toEqual(['@vercel/node']);
  });

  it('handles a package.json without builders', () => {
    const { runtime, builders } = getRuntimeDependencies({
      dependencies: { zod: '4.1.11' },
    });

    expect(runtime).toEqual({ zod: '4.1.11' });
    expect(builders.size).toBe(0);
  });
});

describe('getBinaryOnlyDependencies()', () => {
  it('reads native-only vlt packages from devDependencies', () => {
    expect(
      getBinaryOnlyDependencies({
        devDependencies: {
          '@vltpkg/graph': '1.0.6',
          '@vltpkg/package-info': '1.0.6',
          '@vltpkg/package-json': '1.0.6',
          'path-scurry': '2.0.1',
        },
      })
    ).toEqual({
      '@vltpkg/graph': '1.0.6',
      '@vltpkg/package-info': '1.0.6',
      '@vltpkg/package-json': '1.0.6',
      'path-scurry': '2.0.1',
    });
  });

  it('throws when a native-only package is undeclared', () => {
    expect(() => getBinaryOnlyDependencies({ devDependencies: {} })).toThrow(
      /@vltpkg\/graph/
    );
  });
});

describe('platformForTarget()', () => {
  it('maps pkg targets to process.platform / process.arch values', () => {
    expect(platformForTarget('node24.14.1-linux-x64')).toEqual({
      os: 'linux',
      cpu: 'x64',
    });
    expect(platformForTarget('node24.14.1-linux-arm64')).toEqual({
      os: 'linux',
      cpu: 'arm64',
    });
    expect(platformForTarget('node24.14.1-macos-arm64')).toEqual({
      os: 'darwin',
      cpu: 'arm64',
    });
    expect(platformForTarget('node24.14.1-win-x64')).toEqual({
      os: 'win32',
      cpu: 'x64',
    });
  });

  it('returns null for host or unknown targets', () => {
    expect(platformForTarget('host')).toBeNull();
    expect(platformForTarget(undefined)).toBeNull();
    expect(platformForTarget('node24-freebsd-x64')).toBeNull();
  });
});

describe('assertTargetsMatchHost()', () => {
  const host = { os: 'linux', cpu: 'x64' } as const;

  it('accepts matching, host, and empty targets', () => {
    expect(() =>
      assertTargetsMatchHost(['node24.14.1-linux-x64'], host)
    ).not.toThrow();
    expect(() => assertTargetsMatchHost(['host'], host)).not.toThrow();
    expect(() => assertTargetsMatchHost([], host)).not.toThrow();
  });

  it('rejects cross-platform and cross-arch targets', () => {
    expect(() => assertTargetsMatchHost(['node24.14.1-win-x64'], host)).toThrow(
      /does not match the build host \(linux-x64\)/
    );
    expect(() =>
      assertTargetsMatchHost(['node24.14.1-linux-arm64'], host)
    ).toThrow(/linux-arm64/);
  });
});

describe('getTargets()', () => {
  it('reads --target in both flag forms and splits comma lists', () => {
    expect(getTargets(['--target', 'node24.14.1-linux-x64'])).toEqual([
      'node24.14.1-linux-x64',
    ]);
    expect(
      getTargets(['--target=node24.14.1-linux-x64,node24.14.1-macos-arm64'])
    ).toEqual(['node24.14.1-linux-x64', 'node24.14.1-macos-arm64']);
    expect(getTargets(['--output', 'x'])).toEqual([]);
  });
});

describe('collectReachablePackages() + pruneNodeModules()', () => {
  let root: string;

  async function addPackage(relDir: string, manifest: Record<string, unknown>) {
    const dir = join(root, relDir);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify(manifest));
    return dir;
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'build-binary-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('keeps nested duplicate versions and drops builder-only packages', async () => {
    // runtime dep `sandbox` needs lru-cache@10 (nested); `semver` needs
    // lru-cache@6 (hoisted). `@vercel/node` is a builder that pulls `ts-node`.
    const sandbox = await addPackage('node_modules/sandbox', {
      name: 'sandbox',
      dependencies: { 'lru-cache': '10' },
    });
    const lruNested = await addPackage(
      'node_modules/sandbox/node_modules/lru-cache',
      { name: 'lru-cache', version: '10.0.0' }
    );
    const semver = await addPackage('node_modules/semver', {
      name: 'semver',
      dependencies: { 'lru-cache': '6' },
    });
    const lruHoisted = await addPackage('node_modules/lru-cache', {
      name: 'lru-cache',
      version: '6.0.0',
    });
    await addPackage('node_modules/@vercel/node', {
      name: '@vercel/node',
      dependencies: { 'ts-node': '10' },
    });
    await addPackage('node_modules/ts-node', { name: 'ts-node' });
    // optional dep missing on this platform must not be an error
    const esbuild = await addPackage('node_modules/esbuild', {
      name: 'esbuild',
      optionalDependencies: { '@esbuild/win32-x64': '0.27.0' },
    });
    await mkdir(join(root, 'node_modules/.bin'), { recursive: true });

    const { keep, unresolved } = await collectReachablePackages({
      root,
      entryPackages: ['sandbox', 'semver', 'esbuild'],
      skip: new Set(['@vercel/node']),
    });

    expect(unresolved).toEqual([]);
    expect([...keep].sort()).toEqual(
      [sandbox, lruNested, semver, lruHoisted, esbuild].sort()
    );

    const removed = await pruneNodeModules(join(root, 'node_modules'), keep);

    expect(removed).toBe(2); // @vercel/node, ts-node
    await expect(stat(lruNested)).resolves.toBeTruthy();
    await expect(stat(lruHoisted)).resolves.toBeTruthy();
    await expect(stat(join(root, 'node_modules/ts-node'))).rejects.toThrow();
    await expect(stat(join(root, 'node_modules/@vercel'))).rejects.toThrow();
    await expect(stat(join(root, 'node_modules/.bin'))).rejects.toThrow();
  });

  it('reports required dependencies that are not installed', async () => {
    await addPackage('node_modules/a', {
      name: 'a',
      dependencies: { missing: '1' },
    });

    const { unresolved } = await collectReachablePackages({
      root,
      entryPackages: ['a'],
    });

    expect(unresolved).toEqual(['missing (from node_modules/a)']);
  });

  it('throws when an entry package is not installed', async () => {
    await expect(
      collectReachablePackages({ root, entryPackages: ['nope'] })
    ).rejects.toThrow(/not installed/);
  });
});
