import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import {
  BUILD_CACHE_MARKER_FILENAME,
  PythonBuildCache,
  type PythonBuildCacheCompilePlan,
  type PythonBuildCacheMode,
} from '../src/build-cache';
import { LAMBDA_EPHEMERAL_STORAGE_BYTES } from '../src/dependency-externalizer';
import type { DistributionCacheEntry } from '../src/installed-distributions';
import { COMPILE_ALL_SCRIPT_PATH } from '../src/compileall';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'vc-python-build-cache-'));
  tempDirs.push(dir);
  return dir;
}

function makeEntry({
  venvPath,
  packageName,
  version = '1.0.0',
  hash = 'sha256=source',
  origin,
}: {
  venvPath: string;
  packageName: string;
  version?: string;
  hash?: string;
  origin?: DistributionCacheEntry['origin'];
}): DistributionCacheEntry {
  const sitePackagesDir = path.join(
    venvPath,
    'lib',
    'python3.12',
    'site-packages'
  );
  const moduleName = packageName.replaceAll('-', '_');
  const relativePath = `${moduleName}/module.py`;
  const absolutePath = path.join(sitePackagesDir, moduleName, 'module.py');
  fs.outputFileSync(absolutePath, `${moduleName} = True\n`);
  return {
    packageName,
    version,
    origin,
    sitePackagesDir,
    records: [{ path: relativePath, hash, size: '16' }],
    sourceFiles: [{ absolutePath, relativePath }],
  };
}

function makeCache(rootPath: string): PythonBuildCache {
  return new PythonBuildCache({ rootPath, workPath: rootPath });
}

async function getPlan({
  cache,
  venvPath,
  entries,
  mode = 'standard',
  totalBundleSize = 1,
  pythonMinor = 12,
  includePackages,
}: {
  cache: PythonBuildCache;
  venvPath: string;
  entries: DistributionCacheEntry[];
  mode?: PythonBuildCacheMode;
  totalBundleSize?: number;
  pythonMinor?: number;
  includePackages?: string[];
}): Promise<PythonBuildCacheCompilePlan> {
  return cache.getCompilePlan({
    venvPath,
    installedDistributions: {
      getBuildCacheEntries: packages => {
        if (!packages) return entries;
        const included = new Set(
          packages.map(packageName => packageName.replaceAll('_', '-'))
        );
        return entries.filter(entry => included.has(entry.packageName));
      },
    },
    pythonMajor: 3,
    pythonMinor,
    pythonRuntime: `python3.${pythonMinor}`,
    mode,
    totalBundleSize,
    includePackages,
    volatilePackages: ['vercel-runtime', 'vercel-workers'],
  });
}

async function writeExpectedBytecode(
  plan: PythonBuildCacheCompilePlan
): Promise<void> {
  await Promise.all(
    plan.expectedBytecodeFiles.map(file =>
      fs.outputFile(file.fsPath, `bytecode:${file.path}`)
    )
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.removeSync(dir);
});

describe('PythonBuildCache', () => {
  it('reuses stable bytecode while recompiling injected and local packages', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const cache = makeCache(rootPath);
    const stable = makeEntry({ venvPath, packageName: 'stable-package' });
    const injected = makeEntry({ venvPath, packageName: 'vercel-runtime' });
    const local = makeEntry({
      venvPath,
      packageName: 'local-package',
      origin: {
        tag: 'local-directory',
        val: { url: 'file:///project/local-package', editable: false },
      },
    });

    const coldPlan = await getPlan({
      cache,
      venvPath,
      entries: [stable, injected, local],
    });
    expect(coldPlan.cacheHit).toBe(false);
    expect(coldPlan.vendorSourceFiles).toEqual(
      [
        local.sourceFiles[0].absolutePath,
        stable.sourceFiles[0].absolutePath,
        injected.sourceFiles[0].absolutePath,
      ].sort()
    );

    await writeExpectedBytecode(coldPlan);
    await expect(cache.commit(coldPlan)).resolves.toBe(true);
    expect(
      fs
        .readdirSync(venvPath)
        .some(file => file.startsWith(`${BUILD_CACHE_MARKER_FILENAME}.`))
    ).toBe(false);

    const warmPlan = await getPlan({
      cache,
      venvPath,
      entries: [stable, injected, local],
    });
    expect(warmPlan.cacheHit).toBe(true);
    expect(warmPlan.vendorSourceFiles).toEqual(
      [
        local.sourceFiles[0].absolutePath,
        injected.sourceFiles[0].absolutePath,
      ].sort()
    );
    expect(warmPlan.stableVendorSourceFileCount).toBe(1);
    expect(warmPlan.volatileVendorSourceFileCount).toBe(2);
  });

  it.each([
    [
      'version change',
      (entries: DistributionCacheEntry[]) => [
        { ...entries[0], version: '2.0.0' },
      ],
    ],
    [
      'RECORD change',
      (entries: DistributionCacheEntry[]) => [
        {
          ...entries[0],
          records: [{ ...entries[0].records[0], hash: 'sha256=changed' }],
        },
      ],
    ],
    [
      'dependency addition',
      (entries: DistributionCacheEntry[], venvPath: string) => [
        ...entries,
        makeEntry({ venvPath, packageName: 'added-package' }),
      ],
    ],
    [
      'dependency removal',
      (entries: DistributionCacheEntry[]) => entries.slice(0, 1),
    ],
  ])('misses without deleting the marker on %s', async (_name, mutate) => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const cache = makeCache(rootPath);
    const entries = [
      makeEntry({ venvPath, packageName: 'first-package' }),
      makeEntry({ venvPath, packageName: 'second-package' }),
    ];
    const coldPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(coldPlan);
    expect(await cache.commit(coldPlan)).toBe(true);

    const changedPlan = await getPlan({
      cache,
      venvPath,
      entries: mutate(entries, venvPath),
    });
    expect(changedPlan.cacheHit).toBe(false);
    expect(
      fs.existsSync(path.join(venvPath, BUILD_CACHE_MARKER_FILENAME))
    ).toBe(true);
  });

  it('misses when stable source content changes without a RECORD update', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    const coldPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(coldPlan);
    expect(await cache.commit(coldPlan)).toBe(true);

    fs.writeFileSync(
      entries[0].sourceFiles[0].absolutePath,
      'CHANGED = True\n'
    );

    expect((await getPlan({ cache, venvPath, entries })).cacheHit).toBe(false);
  });

  it('caches readable bytecode when a RECORD-listed source is missing', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const cache = makeCache(rootPath);
    const readable = makeEntry({
      venvPath,
      packageName: 'readable-package',
    });
    const missing = makeEntry({ venvPath, packageName: 'missing-package' });
    const entries = [readable, missing];
    fs.removeSync(missing.sourceFiles[0].absolutePath);

    const coldPlan = await getPlan({ cache, venvPath, entries });
    const readableBytecode = coldPlan.expectedBytecodeFiles.find(file =>
      file.path.includes('readable_package')
    );
    expect(readableBytecode).toBeDefined();
    await fs.outputFile(readableBytecode!.fsPath, 'readable bytecode');
    expect(await cache.commit(coldPlan)).toBe(true);

    expect((await getPlan({ cache, venvPath, entries })).cacheHit).toBe(true);

    fs.outputFileSync(
      missing.sourceFiles[0].absolutePath,
      'missing_package = True\n'
    );
    expect((await getPlan({ cache, venvPath, entries })).cacheHit).toBe(false);
  });

  it('misses when Python, mode, or compilation scope changes', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const cache = makeCache(rootPath);
    const entries = [
      makeEntry({ venvPath, packageName: 'first-package' }),
      makeEntry({ venvPath, packageName: 'second-package' }),
    ];
    const coldPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(coldPlan);
    expect(await cache.commit(coldPlan)).toBe(true);

    expect(
      (await getPlan({ cache, venvPath, entries, pythonMinor: 13 })).cacheHit
    ).toBe(false);

    const scopedPlan = await getPlan({
      cache,
      venvPath,
      entries,
      mode: 'knapsack',
      includePackages: ['first-package'],
    });
    await writeExpectedBytecode(scopedPlan);
    expect(await cache.commit(scopedPlan)).toBe(true);
    expect(
      (
        await getPlan({
          cache,
          venvPath,
          entries,
          mode: 'bytecode-first',
          includePackages: ['second-package'],
        })
      ).cacheHit
    ).toBe(false);
  });

  it.each([
    'null',
    '[]',
    '{}',
    '{"version":1}',
    '{"files":"wrong"}',
  ])('treats malformed marker %s as a miss', async marker => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const markerPath = path.join(venvPath, BUILD_CACHE_MARKER_FILENAME);
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    fs.outputFileSync(markerPath, marker);

    expect((await getPlan({ cache, venvPath, entries })).cacheHit).toBe(false);
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('rejects a marker when restored bytecode is missing', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    const coldPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(coldPlan);
    expect(await cache.commit(coldPlan)).toBe(true);
    fs.removeSync(coldPlan.expectedBytecodeFiles[0].fsPath);

    expect((await getPlan({ cache, venvPath, entries })).cacheHit).toBe(false);
    expect(
      fs.existsSync(path.join(venvPath, BUILD_CACHE_MARKER_FILENAME))
    ).toBe(true);
  });

  it('rejects unsafe paths in an otherwise valid marker', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const markerPath = path.join(venvPath, BUILD_CACHE_MARKER_FILENAME);
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    const coldPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(coldPlan);
    expect(await cache.commit(coldPlan)).toBe(true);
    const marker = fs.readJsonSync(markerPath);
    marker.files[0].path = '../escape/__pycache__/module.cpython-312.pyc';
    fs.writeJsonSync(markerPath, marker);

    expect((await getPlan({ cache, venvPath, entries })).cacheHit).toBe(false);
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('rejects a manifest path outside the current expected set', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const markerPath = path.join(venvPath, BUILD_CACHE_MARKER_FILENAME);
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    const coldPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(coldPlan);
    expect(await cache.commit(coldPlan)).toBe(true);

    const unexpectedPath =
      'lib/python3.12/site-packages/unexpected/__pycache__/module.cpython-312.pyc';
    const unexpectedFsPath = path.join(venvPath, ...unexpectedPath.split('/'));
    fs.outputFileSync(unexpectedFsPath, 'unexpected bytecode');
    const marker = fs.readJsonSync(markerPath);
    marker.files = [
      {
        path: unexpectedPath,
        size: Buffer.byteLength('unexpected bytecode'),
      },
    ];
    fs.writeJsonSync(markerPath, marker);

    expect((await getPlan({ cache, venvPath, entries })).cacheHit).toBe(false);
    expect(fs.existsSync(markerPath)).toBe(true);
  });

  it('commits and reuses a non-empty subset of expected bytecode', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const cache = makeCache(rootPath);
    const entries = [
      makeEntry({ venvPath, packageName: 'first-package' }),
      makeEntry({ venvPath, packageName: 'second-package' }),
    ];
    const plan = await getPlan({
      cache,
      venvPath,
      entries,
    });
    await fs.outputFile(
      plan.expectedBytecodeFiles[0].fsPath,
      'compiled bytecode'
    );

    expect(await cache.commit(plan)).toBe(true);
    const marker = fs.readJsonSync(
      path.join(venvPath, BUILD_CACHE_MARKER_FILENAME)
    );
    expect(marker.files).toEqual([
      {
        path: plan.expectedBytecodeFiles[0].path,
        size: Buffer.byteLength('compiled bytecode'),
      },
    ]);

    const warmPlan = await getPlan({ cache, venvPath, entries });
    expect(warmPlan.cacheHit).toBe(true);
    expect(warmPlan.vendorSourceFiles).toEqual([]);
  });

  it('preserves the previous marker when no expected bytecode exists', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const markerPath = path.join(venvPath, BUILD_CACHE_MARKER_FILENAME);
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    const initialPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(initialPlan);
    expect(await cache.commit(initialPlan)).toBe(true);
    const previousMarker = fs.readFileSync(markerPath, 'utf8');

    fs.writeFileSync(
      entries[0].sourceFiles[0].absolutePath,
      'CHANGED = True\n'
    );
    const changedPlan = await getPlan({ cache, venvPath, entries });
    fs.removeSync(changedPlan.expectedBytecodeFiles[0].fsPath);

    expect(await cache.commit(changedPlan)).toBe(false);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe(previousMarker);
    expect(
      fs
        .readdirSync(venvPath)
        .some(file => file.startsWith(`${BUILD_CACHE_MARKER_FILENAME}.`))
    ).toBe(false);
  });

  it.each([
    'standard',
    'knapsack',
    'bytecode-first',
  ] as const)('caches %s at the inclusive 500 MiB boundary', async mode => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const plan = await getPlan({
      cache: makeCache(rootPath),
      venvPath,
      entries: [makeEntry({ venvPath, packageName: 'stable-package' })],
      mode,
      totalBundleSize: LAMBDA_EPHEMERAL_STORAGE_BYTES,
    });
    expect(plan.cacheable).toBe(true);
  });

  it.each([
    ['standard above 500 MiB', 'standard' as const],
    ['knapsack above 500 MiB', 'knapsack' as const],
    ['bytecode-first above 500 MiB', 'bytecode-first' as const],
    ['Hive at any size', 'hive' as const],
  ])('does not cache %s', async (_name, mode) => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const plan = await getPlan({
      cache: makeCache(rootPath),
      venvPath,
      entries: [makeEntry({ venvPath, packageName: 'stable-package' })],
      mode,
      totalBundleSize: mode === 'hive' ? 1 : LAMBDA_EPHEMERAL_STORAGE_BYTES + 1,
    });
    expect(plan.cacheable).toBe(false);
  });

  it.each([
    ['an oversized standard plan', 'standard' as const],
    ['a Hive plan', 'hive' as const],
  ])('preserves a valid marker for %s', async (_name, mode) => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const markerPath = path.join(venvPath, BUILD_CACHE_MARKER_FILENAME);
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    const initialPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(initialPlan);
    expect(await cache.commit(initialPlan)).toBe(true);

    const ineligiblePlan = await getPlan({
      cache,
      venvPath,
      entries,
      mode,
      totalBundleSize: mode === 'hive' ? 1 : LAMBDA_EPHEMERAL_STORAGE_BYTES + 1,
    });
    expect(ineligiblePlan.cacheable).toBe(false);
    expect(fs.existsSync(markerPath)).toBe(true);
  });

  it('preserves the previous marker when a marker write fails', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const markerPath = path.join(venvPath, BUILD_CACHE_MARKER_FILENAME);
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    const initialPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(initialPlan);
    expect(await cache.commit(initialPlan)).toBe(true);
    const previousMarker = fs.readFileSync(markerPath, 'utf8');

    fs.writeFileSync(
      entries[0].sourceFiles[0].absolutePath,
      'CHANGED = True\n'
    );
    const changedPlan = await getPlan({ cache, venvPath, entries });
    await writeExpectedBytecode(changedPlan);
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(
      new Error('rename failed')
    );

    expect(await cache.commit(changedPlan)).toBe(false);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe(previousMarker);
    expect(
      fs
        .readdirSync(venvPath)
        .some(file => file.startsWith(`${BUILD_CACHE_MARKER_FILENAME}.`))
    ).toBe(false);
  });

  it('fingerprints the compile coordinator contents', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const cache = makeCache(rootPath);
    const entries = [makeEntry({ venvPath, packageName: 'stable-package' })];
    const originalReadFile = fs.promises.readFile.bind(fs.promises);
    let compilerContents = Buffer.from('first compiler');
    vi.spyOn(fs.promises, 'readFile').mockImplementation(((
      filePath: any,
      options?: any
    ) => {
      if (filePath === COMPILE_ALL_SCRIPT_PATH) {
        return Promise.resolve(compilerContents);
      }
      return originalReadFile(filePath, options);
    }) as any);

    const firstPlan = await getPlan({ cache, venvPath, entries });
    compilerContents = Buffer.from('second compiler');
    const secondPlan = await getPlan({ cache, venvPath, entries });

    expect(firstPlan.marker?.fingerprint).not.toBe(
      secondPlan.marker?.fingerprint
    );
  });

  it('prepares validated bytecode independently for default and service venvs', async () => {
    const rootPath = makeTempDir();
    const defaultVenv = path.join(rootPath, '.vercel/python/.venv');
    const serviceVenv = path.join(
      rootPath,
      '.vercel/python/services/api/.venv'
    );
    const cache = makeCache(rootPath);
    const defaultEntry = makeEntry({
      venvPath: defaultVenv,
      packageName: 'default-package',
    });
    const localEntry = makeEntry({
      venvPath: defaultVenv,
      packageName: 'local-package',
      origin: {
        tag: 'local-directory',
        val: { url: 'file:///project/local-package', editable: true },
      },
    });
    const serviceEntry = makeEntry({
      venvPath: serviceVenv,
      packageName: 'service-package',
    });
    const defaultPlan = await getPlan({
      cache,
      venvPath: defaultVenv,
      entries: [defaultEntry, localEntry],
    });
    const servicePlan = await getPlan({
      cache,
      venvPath: serviceVenv,
      entries: [serviceEntry],
    });
    await writeExpectedBytecode(defaultPlan);
    await writeExpectedBytecode(servicePlan);
    expect(await cache.commit(defaultPlan)).toBe(true);
    expect(await cache.commit(servicePlan)).toBe(true);

    const excludedPycFiles = [
      path.join(
        rootPath,
        '.vercel/python/cache/uv/archive/pkg/__pycache__/module.pyc'
      ),
      path.join(
        defaultVenv,
        'lib/python3.12/site-packages/unlisted/__pycache__/module.cpython-312.pyc'
      ),
      path.join(
        defaultVenv,
        'lib/python3.12/site-packages/default_package/__pycache__/generated.cpython-312.pyc'
      ),
      path.join(
        defaultVenv,
        'lib/python3.12/site-packages/local_package/__pycache__/module.cpython-312.pyc'
      ),
    ];
    for (const file of excludedPycFiles) fs.outputFileSync(file, 'excluded');

    const files = await cache.prepareFiles();
    expect(
      files[
        '.vercel/python/.venv/lib/python3.12/site-packages/default_package/__pycache__/module.cpython-312.pyc'
      ]
    ).toBeDefined();
    expect(
      files[
        '.vercel/python/services/api/.venv/lib/python3.12/site-packages/service_package/__pycache__/module.cpython-312.pyc'
      ]
    ).toBeDefined();
    for (const excluded of excludedPycFiles) {
      expect(Object.values(files).some(file => file.fsPath === excluded)).toBe(
        false
      );
    }
  });
});
