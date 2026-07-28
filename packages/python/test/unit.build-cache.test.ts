import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import {
  BUILD_CACHE_MARKER_FILENAME,
  commitPythonBytecodeCache,
  getPythonBytecodeCacheFiles,
  getPythonBytecodeCachePlan,
  isPythonBytecodeBuildCacheEnabled,
} from '../src/build-cache';
import { COMPILE_ALL_SCRIPT_PATH } from '../src/compileall';
import { LAMBDA_EPHEMERAL_STORAGE_BYTES } from '../src/dependency-externalizer';
import type { InstalledPythonSourceFile } from '../src/installed-distributions';

const tempDirs: string[] = [];
const originalBuildCacheEnv = process.env.VERCEL_PYTHON_BYTECODE_BUILD_CACHE;

type CachePlan = Awaited<ReturnType<typeof getPythonBytecodeCachePlan>>;

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'vc-python-build-cache-'));
  tempDirs.push(dir);
  return dir;
}

function normalizePackageName(packageName: string): string {
  return packageName.toLowerCase().replaceAll(/[-_.]+/g, '-');
}

function makeSource({
  venvPath,
  packageName,
  relativePath = `${packageName.replaceAll('-', '_')}/module.py`,
  contents = `${packageName.replaceAll('-', '_')} = True\n`,
  isFromLocalDirectory = false,
}: {
  venvPath: string;
  packageName: string;
  relativePath?: string;
  contents?: string;
  isFromLocalDirectory?: boolean;
}): InstalledPythonSourceFile {
  const sitePackagesDir = path.join(
    venvPath,
    'lib',
    'python3.12',
    'site-packages'
  );
  const absolutePath = path.join(sitePackagesDir, ...relativePath.split('/'));
  fs.outputFileSync(absolutePath, contents);
  return {
    packageName,
    sitePackagesDir,
    absolutePath,
    relativePath,
    isFromLocalDirectory,
  };
}

async function getPlan({
  venvPath,
  sources,
  isHive = false,
  totalBundleSize = 1,
  pythonMajor = 3,
  pythonMinor = 12,
  includePackages,
  volatilePackages = ['vercel-runtime', 'vercel-workers'],
}: {
  venvPath: string;
  sources: InstalledPythonSourceFile[];
  isHive?: boolean;
  totalBundleSize?: number;
  pythonMajor?: number;
  pythonMinor?: number;
  includePackages?: string[];
  volatilePackages?: string[];
}): Promise<CachePlan> {
  return getPythonBytecodeCachePlan({
    venvPath,
    installedDistributions: {
      getPythonSourceFiles: packages => {
        if (!packages) return sources;
        const included = new Set(packages.map(normalizePackageName));
        return sources.filter(source =>
          included.has(normalizePackageName(source.packageName))
        );
      },
    },
    pythonMajor,
    pythonMinor,
    isHive,
    totalBundleSize,
    includePackages,
    volatilePackages,
  });
}

async function writeExpectedBytecode(plan: CachePlan): Promise<void> {
  await Promise.all(
    plan.expectedBytecodeFiles.map(file =>
      fs.outputFile(file.fsPath, `bytecode:${file.path}`)
    )
  );
}

function getMarkerPath(venvPath: string): string {
  return path.join(venvPath, BUILD_CACHE_MARKER_FILENAME);
}

async function populateCache(plan: CachePlan): Promise<void> {
  await writeExpectedBytecode(plan);
  expect(await commitPythonBytecodeCache(plan)).toBe(true);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.removeSync(dir);
  if (originalBuildCacheEnv === undefined) {
    delete process.env.VERCEL_PYTHON_BYTECODE_BUILD_CACHE;
  } else {
    process.env.VERCEL_PYTHON_BYTECODE_BUILD_CACHE = originalBuildCacheEnv;
  }
});

describe('Python bytecode build cache', () => {
  it('enables build caching only for an exact flag value of 1', () => {
    delete process.env.VERCEL_PYTHON_BYTECODE_BUILD_CACHE;
    expect(isPythonBytecodeBuildCacheEnabled()).toBe(false);

    process.env.VERCEL_PYTHON_BYTECODE_BUILD_CACHE = 'true';
    expect(isPythonBytecodeBuildCacheEnabled()).toBe(false);

    process.env.VERCEL_PYTHON_BYTECODE_BUILD_CACHE = '1';
    expect(isPythonBytecodeBuildCacheEnabled()).toBe(true);
  });

  it('atomically commits a complete versioned marker and reuses it', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const source = makeSource({
      venvPath,
      packageName: 'stable-package',
    });

    const coldPlan = await getPlan({ venvPath, sources: [source] });
    expect(coldPlan.cacheHit).toBe(false);
    expect(coldPlan.vendorSourceFiles).toEqual([source.absolutePath]);
    await populateCache(coldPlan);

    const marker = fs.readJsonSync(getMarkerPath(venvPath));
    expect(marker).toEqual({
      version: 1,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      cacheTag: 'cpython-312',
      files: coldPlan.expectedBytecodeFiles.map(file => ({
        path: file.path,
        size: Buffer.byteLength(`bytecode:${file.path}`),
      })),
    });
    expect(
      fs
        .readdirSync(venvPath)
        .some(file => file.startsWith(`${BUILD_CACHE_MARKER_FILENAME}.`))
    ).toBe(false);

    const warmPlan = await getPlan({ venvPath, sources: [source] });
    expect(warmPlan.cacheHit).toBe(true);
    expect(warmPlan.vendorSourceFiles).toEqual([]);
  });

  it('always recompiles local, injected, and configured volatile packages', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const stable = makeSource({ venvPath, packageName: 'stable-package' });
    const local = makeSource({
      venvPath,
      packageName: 'local-package',
      isFromLocalDirectory: true,
    });
    const injected = makeSource({
      venvPath,
      packageName: 'vercel-runtime',
    });
    const configured = makeSource({
      venvPath,
      packageName: 'always-bundle',
    });
    const sources = [stable, local, injected, configured];

    const coldPlan = await getPlan({
      venvPath,
      sources,
      volatilePackages: ['vercel-runtime', 'vercel-workers', 'always-bundle'],
    });
    await populateCache(coldPlan);

    const warmPlan = await getPlan({
      venvPath,
      sources,
      volatilePackages: ['vercel-runtime', 'vercel-workers', 'always-bundle'],
    });
    expect(warmPlan.cacheHit).toBe(true);
    expect(warmPlan.vendorSourceFiles).toEqual(
      [
        local.absolutePath,
        injected.absolutePath,
        configured.absolutePath,
      ].sort()
    );
    expect(coldPlan.expectedBytecodeFiles).toHaveLength(1);
  });

  it('invalidates for source content, path additions, and path removals', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const first = makeSource({ venvPath, packageName: 'first-package' });
    const second = makeSource({ venvPath, packageName: 'second-package' });
    const initialPlan = await getPlan({
      venvPath,
      sources: [first, second],
    });
    await populateCache(initialPlan);

    fs.writeFileSync(first.absolutePath, 'CHANGED = True\n');
    expect(
      (await getPlan({ venvPath, sources: [first, second] })).cacheHit
    ).toBe(false);
    fs.writeFileSync(first.absolutePath, 'first_package = True\n');

    expect((await getPlan({ venvPath, sources: [first] })).cacheHit).toBe(
      false
    );

    const third = makeSource({ venvPath, packageName: 'third-package' });
    expect(
      (await getPlan({ venvPath, sources: [first, second, third] })).cacheHit
    ).toBe(false);
    expect(fs.existsSync(getMarkerPath(venvPath))).toBe(true);
  });

  it('ignores package metadata changes when source inputs are identical', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const source = makeSource({
      venvPath,
      packageName: 'original-package-name',
      relativePath: 'shared/module.py',
    });
    const initialPlan = await getPlan({ venvPath, sources: [source] });
    await populateCache(initialPlan);

    const metadataChanged = {
      ...source,
      packageName: 'renamed-package',
    };
    const warmPlan = await getPlan({
      venvPath,
      sources: [metadataChanged],
    });
    expect(warmPlan.cacheHit).toBe(true);
    expect(warmPlan.marker?.fingerprint).toBe(initialPlan.marker?.fingerprint);
  });

  it('invalidates for Python, compiler, and compilation-scope changes', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const first = makeSource({ venvPath, packageName: 'first-package' });
    const second = makeSource({ venvPath, packageName: 'second-package' });
    const sources = [first, second];
    const initialPlan = await getPlan({ venvPath, sources });
    await populateCache(initialPlan);

    expect(
      (await getPlan({ venvPath, sources, pythonMinor: 13 })).cacheHit
    ).toBe(false);
    expect(
      (
        await getPlan({
          venvPath,
          sources,
          includePackages: ['first-package'],
        })
      ).cacheHit
    ).toBe(false);

    const originalReadFile = fs.promises.readFile.bind(fs.promises);
    vi.spyOn(fs.promises, 'readFile').mockImplementation(((
      filePath: fs.PathLike,
      options?: unknown
    ) => {
      if (filePath === COMPILE_ALL_SCRIPT_PATH) {
        return Promise.resolve(Buffer.from('changed compiler'));
      }
      return originalReadFile(filePath, options as BufferEncoding);
    }) as typeof fs.promises.readFile);
    expect((await getPlan({ venvPath, sources })).cacheHit).toBe(false);
  });

  it('keeps one last-writer-wins scope marker per virtualenv', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const first = makeSource({ venvPath, packageName: 'first-package' });
    const second = makeSource({ venvPath, packageName: 'second-package' });
    const sources = [first, second];

    const firstScope = await getPlan({
      venvPath,
      sources,
      includePackages: ['first-package'],
    });
    await populateCache(firstScope);
    const secondScope = await getPlan({
      venvPath,
      sources,
      includePackages: ['second-package'],
    });
    expect(secondScope.cacheHit).toBe(false);
    await populateCache(secondScope);

    expect(
      (
        await getPlan({
          venvPath,
          sources,
          includePackages: ['first-package'],
        })
      ).cacheHit
    ).toBe(false);
    expect(
      fs
        .readdirSync(venvPath)
        .filter(file => file === BUILD_CACHE_MARKER_FILENAME)
    ).toHaveLength(1);
  });

  it('caches the complete readable set and always compiles missing sources', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const readable = makeSource({
      venvPath,
      packageName: 'readable-package',
    });
    const missing = makeSource({
      venvPath,
      packageName: 'missing-package',
    });
    fs.removeSync(missing.absolutePath);

    const coldPlan = await getPlan({
      venvPath,
      sources: [readable, missing],
    });
    expect(coldPlan.expectedBytecodeFiles).toHaveLength(1);
    expect(coldPlan.vendorSourceFiles).toEqual(
      [readable.absolutePath, missing.absolutePath].sort()
    );
    await populateCache(coldPlan);

    const warmPlan = await getPlan({
      venvPath,
      sources: [readable, missing],
    });
    expect(warmPlan.cacheHit).toBe(true);
    expect(warmPlan.vendorSourceFiles).toEqual([missing.absolutePath]);

    fs.outputFileSync(missing.absolutePath, 'NOW_READABLE = True\n');
    expect(
      (await getPlan({ venvPath, sources: [readable, missing] })).cacheHit
    ).toBe(false);
  });

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['versionless', '{}'],
    [
      'wrong version',
      JSON.stringify({
        version: 2,
        fingerprint: 'a'.repeat(64),
        cacheTag: 'cpython-312',
        files: [
          {
            path: 'lib/__pycache__/module.cpython-312.pyc',
            size: 1,
          },
        ],
      }),
    ],
    [
      'extra field',
      JSON.stringify({
        version: 1,
        fingerprint: 'a'.repeat(64),
        cacheTag: 'cpython-312',
        files: [
          {
            path: 'lib/__pycache__/module.cpython-312.pyc',
            size: 1,
          },
        ],
        mode: 'standard',
      }),
    ],
    [
      'wrong fingerprint',
      JSON.stringify({
        version: 1,
        fingerprint: 'not-a-sha256',
        cacheTag: 'cpython-312',
        files: [],
      }),
    ],
    [
      'wrong cache tag',
      JSON.stringify({
        version: 1,
        fingerprint: 'a'.repeat(64),
        cacheTag: 'python-312',
        files: [],
      }),
    ],
    [
      'negative file size',
      JSON.stringify({
        version: 1,
        fingerprint: 'a'.repeat(64),
        cacheTag: 'cpython-312',
        files: [
          {
            path: 'lib/__pycache__/module.cpython-312.pyc',
            size: -1,
          },
        ],
      }),
    ],
    [
      'duplicate file paths',
      JSON.stringify({
        version: 1,
        fingerprint: 'a'.repeat(64),
        cacheTag: 'cpython-312',
        files: [
          {
            path: 'lib/__pycache__/module.cpython-312.pyc',
            size: 1,
          },
          {
            path: 'lib/__pycache__/module.cpython-312.pyc',
            size: 1,
          },
        ],
      }),
    ],
    [
      'unsorted file paths',
      JSON.stringify({
        version: 1,
        fingerprint: 'a'.repeat(64),
        cacheTag: 'cpython-312',
        files: [
          {
            path: 'lib/z/__pycache__/module.cpython-312.pyc',
            size: 1,
          },
          {
            path: 'lib/a/__pycache__/module.cpython-312.pyc',
            size: 1,
          },
        ],
      }),
    ],
    [
      'unsafe path',
      JSON.stringify({
        version: 1,
        fingerprint: 'a'.repeat(64),
        cacheTag: 'cpython-312',
        files: [
          {
            path: '../escape/__pycache__/module.cpython-312.pyc',
            size: 1,
          },
        ],
      }),
    ],
  ])('removes a malformed %s marker', async (_name, marker) => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const source = makeSource({
      venvPath,
      packageName: 'stable-package',
    });
    fs.outputFileSync(getMarkerPath(venvPath), marker);

    expect((await getPlan({ venvPath, sources: [source] })).cacheHit).toBe(
      false
    );
    expect(fs.existsSync(getMarkerPath(venvPath))).toBe(false);
  });

  it.each([
    'missing',
    'wrong size',
  ] as const)('removes a marker whose bytecode file is %s', async failure => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const source = makeSource({
      venvPath,
      packageName: 'stable-package',
    });
    const initialPlan = await getPlan({ venvPath, sources: [source] });
    await populateCache(initialPlan);
    const [bytecodeFile] = initialPlan.expectedBytecodeFiles;
    if (failure === 'missing') {
      fs.removeSync(bytecodeFile.fsPath);
    } else {
      fs.appendFileSync(bytecodeFile.fsPath, 'changed size');
    }

    expect((await getPlan({ venvPath, sources: [source] })).cacheHit).toBe(
      false
    );
    expect(fs.existsSync(getMarkerPath(venvPath))).toBe(false);
  });

  it('requires the restored manifest to exactly match expected bytecode', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const first = makeSource({ venvPath, packageName: 'first-package' });
    const second = makeSource({ venvPath, packageName: 'second-package' });
    const sources = [first, second];
    const initialPlan = await getPlan({ venvPath, sources });
    await populateCache(initialPlan);
    const markerPath = getMarkerPath(venvPath);
    const marker = fs.readJsonSync(markerPath);

    marker.files = marker.files.slice(0, 1);
    fs.writeJsonSync(markerPath, marker);
    expect((await getPlan({ venvPath, sources })).cacheHit).toBe(false);
    expect(fs.existsSync(markerPath)).toBe(true);
  });

  it('does not advance a marker after partial compilation', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const first = makeSource({ venvPath, packageName: 'first-package' });
    const second = makeSource({ venvPath, packageName: 'second-package' });
    const sources = [first, second];
    const initialPlan = await getPlan({ venvPath, sources });
    await populateCache(initialPlan);
    const markerPath = getMarkerPath(venvPath);
    const originalMarker = fs.readFileSync(markerPath, 'utf8');

    fs.writeFileSync(first.absolutePath, 'CHANGED = True\n');
    const changedPlan = await getPlan({ venvPath, sources });
    fs.removeSync(changedPlan.expectedBytecodeFiles[0].fsPath);
    await fs.outputFile(
      changedPlan.expectedBytecodeFiles[1].fsPath,
      'new bytecode'
    );

    expect(await commitPythonBytecodeCache(changedPlan)).toBe(false);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe(originalMarker);
  });

  it('does not create a marker when the first compilation is partial', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const sources = [
      makeSource({ venvPath, packageName: 'first-package' }),
      makeSource({ venvPath, packageName: 'second-package' }),
    ];
    const plan = await getPlan({ venvPath, sources });
    await fs.outputFile(plan.expectedBytecodeFiles[0].fsPath, 'bytecode');

    expect(await commitPythonBytecodeCache(plan)).toBe(false);
    expect(fs.existsSync(getMarkerPath(venvPath))).toBe(false);
  });

  it('preserves a complete older marker until its replacement commits', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const source = makeSource({
      venvPath,
      packageName: 'stable-package',
    });
    const initialPlan = await getPlan({ venvPath, sources: [source] });
    await populateCache(initialPlan);
    const markerPath = getMarkerPath(venvPath);
    const originalMarker = fs.readFileSync(markerPath, 'utf8');

    fs.writeFileSync(source.absolutePath, 'CHANGED = True\n');
    const changedPlan = await getPlan({ venvPath, sources: [source] });
    expect(changedPlan.cacheHit).toBe(false);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe(originalMarker);

    await writeExpectedBytecode(changedPlan);
    expect(await commitPythonBytecodeCache(changedPlan)).toBe(true);
    expect(fs.readFileSync(markerPath, 'utf8')).not.toBe(originalMarker);
  });

  it.each([
    ['a function above 500 MiB', false] as const,
    ['a Hive function', true] as const,
  ])('removes the marker and disables caching for %s', async (_name, isHive) => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const source = makeSource({
      venvPath,
      packageName: 'stable-package',
    });
    const initialPlan = await getPlan({ venvPath, sources: [source] });
    await populateCache(initialPlan);

    const disabledPlan = await getPlan({
      venvPath,
      sources: [source],
      isHive,
      totalBundleSize: isHive ? 1 : LAMBDA_EPHEMERAL_STORAGE_BYTES + 1,
    });
    expect(disabledPlan.marker).toBeNull();
    expect(disabledPlan.vendorSourceFiles).toEqual([source.absolutePath]);
    expect(fs.existsSync(getMarkerPath(venvPath))).toBe(false);
  });

  it('caches at the inclusive 500 MiB boundary', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const source = makeSource({
      venvPath,
      packageName: 'stable-package',
    });
    const plan = await getPlan({
      venvPath,
      sources: [source],
      totalBundleSize: LAMBDA_EPHEMERAL_STORAGE_BYTES,
    });
    expect(plan.marker).not.toBeNull();
  });

  it('preserves the previous marker when an atomic rename fails', async () => {
    const rootPath = makeTempDir();
    const venvPath = path.join(rootPath, '.vercel/python/.venv');
    const source = makeSource({
      venvPath,
      packageName: 'stable-package',
    });
    const initialPlan = await getPlan({ venvPath, sources: [source] });
    await populateCache(initialPlan);
    const markerPath = getMarkerPath(venvPath);
    const originalMarker = fs.readFileSync(markerPath, 'utf8');

    fs.writeFileSync(source.absolutePath, 'CHANGED = True\n');
    const changedPlan = await getPlan({ venvPath, sources: [source] });
    await writeExpectedBytecode(changedPlan);
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(
      new Error('rename failed')
    );

    expect(await commitPythonBytecodeCache(changedPlan)).toBe(false);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe(originalMarker);
    expect(
      fs
        .readdirSync(venvPath)
        .some(file => file.startsWith(`${BUILD_CACHE_MARKER_FILENAME}.`))
    ).toBe(false);
  });

  it('prepares only complete manifest files from isolated virtualenvs', async () => {
    const rootPath = makeTempDir();
    const defaultVenv = path.join(rootPath, '.vercel/python/.venv');
    const serviceVenv = path.join(
      rootPath,
      '.vercel/python/services/api/.venv'
    );
    const defaultSource = makeSource({
      venvPath: defaultVenv,
      packageName: 'default-package',
    });
    const serviceSource = makeSource({
      venvPath: serviceVenv,
      packageName: 'service-package',
    });
    const defaultPlan = await getPlan({
      venvPath: defaultVenv,
      sources: [defaultSource],
    });
    const servicePlan = await getPlan({
      venvPath: serviceVenv,
      sources: [serviceSource],
    });
    await populateCache(defaultPlan);
    await populateCache(servicePlan);

    const unlistedBytecode = path.join(
      defaultVenv,
      'lib/python3.12/site-packages/unlisted/__pycache__/module.cpython-312.pyc'
    );
    fs.outputFileSync(unlistedBytecode, 'unlisted');

    const files = await getPythonBytecodeCacheFiles(rootPath);
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
    expect(
      Object.values(files).some(file => file.fsPath === unlistedBytecode)
    ).toBe(false);
  });
});
