import { describe, it, expect } from 'vitest';
import { FileBlob, type Files } from '@vercel/build-utils';
import {
  addCollectedVendorBytecode,
  addVendorBytecodeInTiers,
} from '../src/index';
import type { BytecodeCollectionResult } from '../src/compileall';

const MB = 1024 * 1024;

/**
 * Stub externalizer whose collectBytecodeFiles() serves a fixed set of
 * per-package bytecode entries, honoring the includePackages restriction
 * the same way the real implementation does (missing names are skipped).
 */
function makeStubExternalizer(
  packages: Record<string, { bundlePath: string; size: number }>
) {
  const collectCalls: (string[] | undefined)[] = [];
  const stub = {
    collectCalls,
    async collectBytecodeFiles({
      includePackages,
    }: {
      vendorDirName: string;
      includePackages?: string[];
    }) {
      collectCalls.push(includePackages);
      const names = includePackages ?? Object.keys(packages);
      const files: Files = {};
      const perItemSizes = new Map<string, number>();
      let totalSize = 0;
      for (const name of names) {
        const pkg = packages[name];
        if (!pkg) continue;
        files[pkg.bundlePath] = new FileBlob({ data: 'pyc' });
        perItemSizes.set(name, pkg.size);
        totalSize += pkg.size;
      }
      return { files, totalSize, perItemSizes };
    },
  };
  return stub;
}

describe('addVendorBytecodeInTiers', () => {
  const packages = {
    'private-pkg': {
      bundlePath: '_vendor/private/__pycache__/a.pyc',
      size: 2 * MB,
    },
    'wheelless-pkg': {
      bundlePath: '_vendor/wheelless/__pycache__/b.pyc',
      size: 3 * MB,
    },
    'public-big': {
      bundlePath: '_vendor/big/__pycache__/c.pyc',
      size: 10 * MB,
    },
    'public-small': {
      bundlePath: '_vendor/small/__pycache__/d.pyc',
      size: 1 * MB,
    },
    'externalized-pkg': {
      bundlePath: '_vendor/ext/__pycache__/e.pyc',
      size: 4 * MB,
    },
  };

  it('adds bytecode for every tier when capacity fits and returns the remainder', async () => {
    const stub = makeStubExternalizer(packages);
    const files: Files = {};

    const remaining = await addVendorBytecodeInTiers({
      files,
      depExternalizer: stub,
      vendorDir: '_vendor',
      capacity: 20 * MB,
      vendorPackageTiers: [
        ['private-pkg', 'wheelless-pkg'],
        ['public-big', 'public-small'],
      ],
    });

    expect(Object.keys(files).sort()).toEqual(
      [
        packages['private-pkg'].bundlePath,
        packages['wheelless-pkg'].bundlePath,
        packages['public-big'].bundlePath,
        packages['public-small'].bundlePath,
      ].sort()
    );
    expect(remaining).toBe(4 * MB);
  });

  it('never collects packages outside the tiers (externalized deps)', async () => {
    const stub = makeStubExternalizer(packages);
    const files: Files = {};

    await addVendorBytecodeInTiers({
      files,
      depExternalizer: stub,
      vendorDir: '_vendor',
      capacity: 100 * MB,
      vendorPackageTiers: [['private-pkg'], ['public-big']],
    });

    expect(files[packages['externalized-pkg'].bundlePath]).toBeUndefined();
    for (const call of stub.collectCalls) {
      expect(call).toBeDefined();
      expect(call).not.toContain('externalized-pkg');
    }
  });

  it('gives earlier tiers capacity first', async () => {
    const stub = makeStubExternalizer(packages);
    const files: Files = {};

    // Capacity fits tier 1 (5MB) plus only the small public package.
    const remaining = await addVendorBytecodeInTiers({
      files,
      depExternalizer: stub,
      vendorDir: '_vendor',
      capacity: 6 * MB,
      vendorPackageTiers: [
        ['private-pkg', 'wheelless-pkg'],
        ['public-big', 'public-small'],
      ],
    });

    expect(files[packages['private-pkg'].bundlePath]).toBeDefined();
    expect(files[packages['wheelless-pkg'].bundlePath]).toBeDefined();
    expect(files[packages['public-small'].bundlePath]).toBeDefined();
    expect(files[packages['public-big'].bundlePath]).toBeUndefined();
    expect(remaining).toBe(0);
  });

  it('stops once capacity is exhausted', async () => {
    const stub = makeStubExternalizer(packages);
    const files: Files = {};

    const remaining = await addVendorBytecodeInTiers({
      files,
      depExternalizer: stub,
      vendorDir: '_vendor',
      capacity: 5 * MB,
      vendorPackageTiers: [
        ['private-pkg', 'wheelless-pkg'],
        ['public-big', 'public-small'],
      ],
    });

    expect(remaining).toBe(0);
    // Tier 2 is never collected: capacity hit zero after tier 1.
    expect(stub.collectCalls).toHaveLength(1);
    expect(files[packages['public-small'].bundlePath]).toBeUndefined();
  });

  it('skips empty tiers without collecting', async () => {
    const stub = makeStubExternalizer(packages);
    const files: Files = {};

    await addVendorBytecodeInTiers({
      files,
      depExternalizer: stub,
      vendorDir: '_vendor',
      capacity: 100 * MB,
      vendorPackageTiers: [[], ['public-small']],
    });

    expect(stub.collectCalls).toHaveLength(1);
    expect(stub.collectCalls[0]).toEqual(['public-small']);
  });

  it('collects every vendor package for an undefined tier', async () => {
    const stub = makeStubExternalizer(packages);
    const files: Files = {};

    await addVendorBytecodeInTiers({
      files,
      depExternalizer: stub,
      vendorDir: '_vendor',
      capacity: 100 * MB,
      vendorPackageTiers: [undefined],
    });

    expect(Object.keys(files)).toHaveLength(5);
    expect(stub.collectCalls).toEqual([undefined]);
  });

  it('adds nothing when capacity is zero or negative', async () => {
    const stub = makeStubExternalizer(packages);
    const files: Files = {};

    const remaining = await addVendorBytecodeInTiers({
      files,
      depExternalizer: stub,
      vendorDir: '_vendor',
      capacity: -1 * MB,
      vendorPackageTiers: [['private-pkg']],
    });

    expect(Object.keys(files)).toHaveLength(0);
    expect(stub.collectCalls).toHaveLength(0);
    expect(remaining).toBe(-1 * MB);
  });
});

describe('addCollectedVendorBytecode', () => {
  function makeCollector(
    packages: Record<string, { bundlePath: string; size: number }>
  ) {
    const calls: (string[] | undefined)[] = [];
    const collect = async (
      includePackages?: string[]
    ): Promise<BytecodeCollectionResult> => {
      calls.push(includePackages);
      const names = includePackages ?? Object.keys(packages);
      const files: Files = {};
      const perItemSizes = new Map<string, number>();
      let totalSize = 0;
      for (const name of names) {
        const pkg = packages[name];
        if (!pkg) continue;
        files[pkg.bundlePath] = new FileBlob({ data: 'pyc' });
        perItemSizes.set(name, pkg.size);
        totalSize += pkg.size;
      }
      return { files, totalSize, perItemSizes };
    };
    return { collect, calls };
  }

  const packages = {
    big: { bundlePath: '_vc_pycache/tmp/x/big.pyc', size: 10 * MB },
    small: { bundlePath: '_vc_pycache/tmp/x/small.pyc', size: 1 * MB },
  };

  it('adds the full collection when it fits', async () => {
    const { collect, calls } = makeCollector(packages);
    const files: Files = {};

    const remaining = await addCollectedVendorBytecode({
      files,
      capacity: 20 * MB,
      collect,
    });

    expect(Object.keys(files)).toHaveLength(2);
    expect(remaining).toBe(9 * MB);
    expect(calls).toEqual([undefined]);
  });

  it('knapsacks and re-collects when the collection exceeds capacity', async () => {
    const { collect, calls } = makeCollector(packages);
    const files: Files = {};

    const remaining = await addCollectedVendorBytecode({
      files,
      capacity: 5 * MB,
      collect,
    });

    expect(Object.keys(files)).toEqual([packages.small.bundlePath]);
    expect(remaining).toBe(4 * MB);
    expect(calls).toEqual([undefined, ['small']]);
  });

  it('does nothing with zero or negative capacity', async () => {
    const { collect, calls } = makeCollector(packages);
    const files: Files = {};

    const remaining = await addCollectedVendorBytecode({
      files,
      capacity: 0,
      collect,
    });

    expect(Object.keys(files)).toHaveLength(0);
    expect(remaining).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('does nothing when the collection is empty', async () => {
    const { collect } = makeCollector({});
    const files: Files = {};

    const remaining = await addCollectedVendorBytecode({
      files,
      capacity: 5 * MB,
      collect,
    });

    expect(Object.keys(files)).toHaveLength(0);
    expect(remaining).toBe(5 * MB);
  });
});
