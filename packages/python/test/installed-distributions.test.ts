import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { FileFsRef } from '@vercel/build-utils';
import type {
  Distribution,
  DistributionIndex,
  PackagePath,
} from '@vercel/python-analysis';
import { deriveStagedPycFsPath, PYCACHE_PREFIX_DIR } from '../src/compileall';
import { RUNTIME_DEPS_DIR } from '../src/dependency-externalizer';
import {
  getDistributionFileGroups,
  InstalledPythonDistributions,
} from '../src/installed-distributions';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createDistribution(name: string, files: PackagePath[]): Distribution {
  return {
    name,
    version: '1.0.0',
    metadataVersion: '2.1',
    requiresDist: [],
    providesExtra: [],
    classifiers: [],
    projectUrls: [],
    platforms: [],
    dynamic: [],
    files,
  };
}

function createDistributionIndex(
  entries: [string, PackagePath[]][]
): DistributionIndex {
  return new Map(
    entries.map(([name, files]) => [name, createDistribution(name, files)])
  );
}

function createInstalledDistributions({
  sitePackagesDir,
  distributions,
  pythonMajor = 3,
  pythonMinor = 12,
}: {
  sitePackagesDir: string;
  distributions: DistributionIndex;
  pythonMajor?: number;
  pythonMinor?: number;
}): InstalledPythonDistributions {
  return new InstalledPythonDistributions({
    sitePackageDirs: [sitePackagesDir],
    distributions: new Map([[sitePackagesDir, distributions]]),
    pythonMajor,
    pythonMinor,
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.removeSync(dir);
  }
});

describe('getDistributionFileGroups', () => {
  it('normalizes package scopes and returns canonical in-root entries', () => {
    const sitePackagesDir = path.join(tmpdir(), 'safe-record-site-packages');
    const moduleRecord = {
      path: 'my_package/module.py',
      hash: 'sha256=module',
      size: 12n,
    };
    const canonicalRecord = {
      path: 'my_package/../canonical.py',
      hash: 'sha256=canonical',
      size: 34n,
    };
    const index = createDistributionIndex([
      [
        'My_Package',
        [
          moduleRecord,
          canonicalRecord,
          { path: '../outside.py' },
          { path: 'my_package/../../outside.py' },
          { path: '../safe-record-site-packages-other/sibling.py' },
          { path: path.join(tmpdir(), 'absolute-outside.py') },
          { path: '.' },
        ],
      ],
      ['other-package', [{ path: 'other/module.py' }]],
    ]);

    const groups = getDistributionFileGroups({
      sitePackageDirs: [sitePackagesDir],
      distributions: new Map([[sitePackagesDir, index]]),
      includePackages: ['my.package'],
    });

    expect(groups).toEqual([
      {
        packageName: 'my-package',
        sitePackagesDir: path.resolve(sitePackagesDir),
        files: [
          {
            absolutePath: path.resolve(sitePackagesDir, 'my_package/module.py'),
            relativePath: path.join('my_package', 'module.py'),
            record: moduleRecord,
          },
          {
            absolutePath: path.resolve(sitePackagesDir, 'canonical.py'),
            relativePath: 'canonical.py',
            record: canonicalRecord,
          },
        ],
      },
    ]);
  });

  it('supports all, empty, and unmatched scopes across roots', () => {
    const firstDir = path.join(tmpdir(), 'first-record-site-packages');
    const secondDir = path.join(tmpdir(), 'second-record-site-packages');
    const missingDir = path.join(tmpdir(), 'missing-record-site-packages');
    const distributions = new Map<string, DistributionIndex>([
      [
        firstDir,
        createDistributionIndex([['first', [{ path: 'first/module.py' }]]]),
      ],
      [secondDir, createDistributionIndex([['empty', []]])],
    ]);

    expect(
      getDistributionFileGroups({
        sitePackageDirs: [firstDir, missingDir, secondDir],
        distributions,
      }).map(group => ({
        packageName: group.packageName,
        sitePackagesDir: group.sitePackagesDir,
        fileCount: group.files.length,
      }))
    ).toEqual([
      {
        packageName: 'first',
        sitePackagesDir: path.resolve(firstDir),
        fileCount: 1,
      },
      {
        packageName: 'empty',
        sitePackagesDir: path.resolve(secondDir),
        fileCount: 0,
      },
    ]);
    expect(
      getDistributionFileGroups({
        sitePackageDirs: [firstDir],
        distributions,
        includePackages: [],
      })
    ).toEqual([]);
    expect(
      getDistributionFileGroups({
        sitePackageDirs: [firstDir],
        distributions,
        includePackages: ['missing'],
      })
    ).toEqual([]);
  });
});

describe('InstalledPythonDistributions', () => {
  it('mirrors runtime files and calculates normalized package sizes', async () => {
    const sitePackagesDir = makeTempDir('installed-distributions-mirror-');
    const modulePath = path.join(sitePackagesDir, 'my_package', 'module.py');
    const dataPath = path.join(sitePackagesDir, 'my_package', 'data.json');
    const stubPath = path.join(sitePackagesDir, 'my_package', 'module.pyi');
    const wheelPath = path.join(
      sitePackagesDir,
      'my_package-1.0.dist-info',
      'WHEEL'
    );
    fs.outputFileSync(modulePath, 'module');
    fs.outputFileSync(dataPath, 'data');
    fs.outputFileSync(stubPath, 'stub');
    fs.outputFileSync(wheelPath, 'wheel');

    const installed = createInstalledDistributions({
      sitePackagesDir,
      distributions: createDistributionIndex([
        [
          'My_Package',
          [
            { path: 'my_package/module.py', size: 12n },
            { path: 'my_package/data.json' },
            { path: 'my_package/missing.py', size: 20n },
            { path: 'my_package/module.pyi', size: 4n },
            { path: 'my_package-1.0.dist-info/WHEEL', size: 5n },
            { path: '../outside.py', size: 100n },
          ],
        ],
      ]),
    });

    const files = await installed.mirrorPackagesIntoVendor({
      vendorDirName: '_vendor',
      includePackages: ['my.package'],
    });

    expect(Object.keys(files).sort()).toEqual([
      '_vendor/my_package/data.json',
      '_vendor/my_package/module.py',
    ]);
    expect((files['_vendor/my_package/module.py'] as FileFsRef).size).toBe(12);
    expect((files['_vendor/my_package/data.json'] as FileFsRef).size).toBe(4);
    expect(await installed.calculatePerPackageSizes()).toEqual(
      new Map([['my-package', 36]])
    );
  });

  it('collects adjacent bytecode and ignores out-of-tree RECORD entries', async () => {
    const baseDir = makeTempDir('adjacent-bytecode-records-');
    const sitePackagesDir = path.join(baseDir, 'site-packages');
    const includedPyc = path.join(
      sitePackagesDir,
      'pkg',
      '__pycache__',
      'mod.cpython-312.pyc'
    );
    const escapingPyc = path.join(
      baseDir,
      'outside',
      '__pycache__',
      'script.cpython-312.pyc'
    );
    fs.outputFileSync(includedPyc, Buffer.alloc(10));
    fs.outputFileSync(escapingPyc, Buffer.alloc(20));

    const installed = createInstalledDistributions({
      sitePackagesDir,
      distributions: createDistributionIndex([
        ['pkg', [{ path: 'pkg/mod.py' }, { path: '../outside/script.py' }]],
      ]),
    });
    const result = await installed.collectBytecodeFiles({
      vendorDirName: '_vendor',
    });

    expect(Object.keys(result.files)).toEqual([
      '_vendor/pkg/__pycache__/mod.cpython-312.pyc',
    ]);
    expect(result.totalSize).toBe(10);
    expect(result.perItemSizes).toEqual(new Map([['pkg', 10]]));
  });

  it('collects staged prefix bytecode under its runtime root', async () => {
    const baseDir = makeTempDir('prefix-bytecode-records-');
    const sitePackagesDir = path.join(baseDir, 'site-packages');
    const stagingDir = path.join(baseDir, 'staging');
    const stagedPyc = deriveStagedPycFsPath(
      stagingDir,
      path.join(sitePackagesDir, 'pkg', 'mod.py'),
      3,
      12
    );
    expect(stagedPyc).not.toBeNull();
    fs.outputFileSync(stagedPyc!, Buffer.alloc(30));

    const installed = createInstalledDistributions({
      sitePackagesDir,
      distributions: createDistributionIndex([
        ['pkg', [{ path: 'pkg/mod.py' }, { path: 'pkg/native.so' }]],
        ['otherpkg', [{ path: 'otherpkg/mod.py' }]],
      ]),
    });
    const runtimeRoot = `${RUNTIME_DEPS_DIR}/lib/python3.12/site-packages`;
    const result = await installed.collectPrefixBytecodeFiles({
      stagingDir,
      runtimeRoot,
    });

    const expectedKey = `${PYCACHE_PREFIX_DIR}/tmp/_vc_deps/lib/python3.12/site-packages/pkg/mod.cpython-312.pyc`;
    expect(Object.keys(result.files)).toEqual([expectedKey]);
    expect((result.files[expectedKey] as FileFsRef).fsPath).toBe(stagedPyc);
    expect(result.totalSize).toBe(30);
    expect(result.perItemSizes).toEqual(new Map([['pkg', 30]]));
  });

  it('honors prefix package scopes and empty scopes', async () => {
    const baseDir = makeTempDir('prefix-bytecode-scopes-');
    const sitePackagesDir = path.join(baseDir, 'site-packages');
    const stagingDir = path.join(baseDir, 'staging');

    for (const relativePath of ['a/mod.py', 'b/mod.py']) {
      const stagedPyc = deriveStagedPycFsPath(
        stagingDir,
        path.join(sitePackagesDir, relativePath),
        3,
        12
      );
      expect(stagedPyc).not.toBeNull();
      fs.outputFileSync(stagedPyc!, Buffer.alloc(5));
    }

    const installed = createInstalledDistributions({
      sitePackagesDir,
      distributions: createDistributionIndex([
        ['a', [{ path: 'a/mod.py' }]],
        ['b', [{ path: 'b/mod.py' }, { path: '../../bin/script.py' }]],
      ]),
    });
    const scoped = await installed.collectPrefixBytecodeFiles({
      stagingDir,
      runtimeRoot: '/var/task/_vendor',
      includePackages: ['b'],
    });
    const empty = await installed.collectPrefixBytecodeFiles({
      stagingDir,
      runtimeRoot: '/var/task/_vendor',
      includePackages: [],
    });

    expect(Object.keys(scoped.files)).toEqual([
      `${PYCACHE_PREFIX_DIR}/var/task/_vendor/b/mod.cpython-312.pyc`,
    ]);
    expect(scoped.perItemSizes.has('a')).toBe(false);
    expect(Object.keys(empty.files)).toHaveLength(0);
  });

  it('returns no bytecode when the Python version is unavailable', async () => {
    const sitePackagesDir = '/tmp/site-packages';
    const installed = new InstalledPythonDistributions({
      sitePackageDirs: [sitePackagesDir],
      distributions: new Map([
        [
          sitePackagesDir,
          createDistributionIndex([['pkg', [{ path: 'pkg/mod.py' }]]]),
        ],
      ]),
      pythonMajor: undefined,
      pythonMinor: undefined,
    });

    expect(
      await installed.collectBytecodeFiles({ vendorDirName: '_vendor' })
    ).toEqual({ files: {}, totalSize: 0, perItemSizes: new Map() });
    expect(
      await installed.collectPrefixBytecodeFiles({
        stagingDir: '/tmp/staging',
        runtimeRoot: '/var/task/_vendor',
      })
    ).toEqual({ files: {}, totalSize: 0, perItemSizes: new Map() });
  });
});
