import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { debug, FileFsRef, glob, type Files } from '@vercel/build-utils';
import { normalizePackageName } from '@vercel/python-analysis';
import { derivePycPath } from './compileall';
import { LAMBDA_EPHEMERAL_STORAGE_BYTES } from './dependency-externalizer';
import type {
  DistributionCacheEntry,
  InstalledPythonDistributions,
} from './installed-distributions';
import { findUvInPath, getUvCacheDir, UvRunner } from './uv';

export const BUILD_CACHE_MARKER_FILENAME = '.vercel-python-bytecode-cache.json';
const BUILD_CACHE_MARKER_VERSION = 1;

export type PythonBuildCacheMode =
  | 'standard'
  | 'knapsack'
  | 'bytecode-first'
  | 'hive';

interface BytecodeManifestEntry {
  path: string;
  size: number;
}

interface BytecodeCacheMarker {
  version: typeof BUILD_CACHE_MARKER_VERSION;
  fingerprint: string;
  mode: Exclude<PythonBuildCacheMode, 'hive'>;
  python: {
    major: number;
    minor: number;
    runtime: string;
    cacheTag: string;
  };
  packageScope: string[];
  files: BytecodeManifestEntry[];
}

interface ExpectedBytecodeFile {
  path: string;
  fsPath: string;
}

export interface PythonBuildCacheCompilePlan {
  cacheable: boolean;
  cacheHit: boolean;
  vendorSourceFiles: string[];
  stableVendorSourceFileCount: number;
  volatileVendorSourceFileCount: number;
  venvPath: string;
  marker: Omit<BytecodeCacheMarker, 'files'> | null;
  expectedBytecodeFiles: ExpectedBytecodeFile[];
}

interface PythonBuildCacheOptions {
  rootPath: string;
  workPath: string;
}

interface GetCompilePlanOptions {
  venvPath: string;
  installedDistributions: Pick<
    InstalledPythonDistributions,
    'getBuildCacheEntries'
  >;
  pythonMajor: number | undefined;
  pythonMinor: number | undefined;
  pythonRuntime: string;
  mode: PythonBuildCacheMode;
  totalBundleSize: number;
  includePackages?: string[];
  volatilePackages?: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: string[]
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isSortedUnique(values: string[]): boolean {
  for (let index = 1; index < values.length; index++) {
    if (values[index - 1].localeCompare(values[index]) >= 0) return false;
  }
  return true;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isSafeManifestPath(path: string, cacheTag: string): boolean {
  if (
    path.length === 0 ||
    path.includes('\\') ||
    isAbsolute(path) ||
    path.split('/').some(segment => segment === '.' || segment === '..') ||
    !path.split('/').includes('__pycache__') ||
    !path.endsWith(`.${cacheTag}.pyc`)
  ) {
    return false;
  }
  return path === path.replaceAll('//', '/');
}

function parseMarker(value: unknown): BytecodeCacheMarker | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      'files',
      'fingerprint',
      'mode',
      'packageScope',
      'python',
      'version',
    ]) ||
    value.version !== BUILD_CACHE_MARKER_VERSION ||
    (value.mode !== 'standard' &&
      value.mode !== 'knapsack' &&
      value.mode !== 'bytecode-first') ||
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    !Array.isArray(value.packageScope) ||
    !value.packageScope.every(item => typeof item === 'string') ||
    !isSortedUnique(value.packageScope) ||
    !isObject(value.python) ||
    !hasExactKeys(value.python, ['cacheTag', 'major', 'minor', 'runtime']) ||
    typeof value.python.major !== 'number' ||
    !Number.isSafeInteger(value.python.major) ||
    typeof value.python.minor !== 'number' ||
    !Number.isSafeInteger(value.python.minor) ||
    typeof value.python.runtime !== 'string' ||
    typeof value.python.cacheTag !== 'string' ||
    value.python.major < 0 ||
    value.python.minor < 0 ||
    value.python.runtime.length === 0 ||
    value.python.cacheTag !==
      `cpython-${value.python.major}${value.python.minor}` ||
    !Array.isArray(value.files)
  ) {
    return null;
  }

  const files: BytecodeManifestEntry[] = [];
  for (const file of value.files) {
    if (
      !isObject(file) ||
      !hasExactKeys(file, ['path', 'size']) ||
      typeof file.path !== 'string' ||
      typeof file.size !== 'number' ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !isSafeManifestPath(file.path, value.python.cacheTag)
    ) {
      return null;
    }
    files.push({ path: file.path, size: file.size });
  }
  if (files.length === 0 || !isSortedUnique(files.map(file => file.path))) {
    return null;
  }

  return {
    version: BUILD_CACHE_MARKER_VERSION,
    fingerprint: value.fingerprint,
    mode: value.mode,
    python: {
      major: value.python.major,
      minor: value.python.minor,
      runtime: value.python.runtime,
      cacheTag: value.python.cacheTag,
    },
    packageScope: value.packageScope,
    files,
  };
}

function getVenvRelativePath(
  venvPath: string,
  targetPath: string
): string | null {
  const result = relative(resolve(venvPath), resolve(targetPath));
  if (
    result === '' ||
    result === '..' ||
    result.startsWith(`..${sep}`) ||
    isAbsolute(result)
  ) {
    return null;
  }
  return result.replaceAll(sep, '/');
}

function sortCacheEntries(
  venvPath: string,
  entries: DistributionCacheEntry[]
): (DistributionCacheEntry & { sitePackagesPath: string })[] | null {
  const normalized = entries.map(entry => {
    const sitePackagesPath = getVenvRelativePath(
      venvPath,
      entry.sitePackagesDir
    );
    return sitePackagesPath ? { ...entry, sitePackagesPath } : null;
  });
  if (normalized.some(entry => entry === null)) return null;

  return normalized
    .filter(entry => entry !== null)
    .sort((a, b) =>
      `${a.sitePackagesPath}\0${a.packageName}\0${a.version}`.localeCompare(
        `${b.sitePackagesPath}\0${b.packageName}\0${b.version}`
      )
    );
}

async function hashStableSources(
  entries: DistributionCacheEntry[]
): Promise<Map<string, string> | null> {
  const sourceFiles = uniqueSorted(
    entries.flatMap(entry => entry.sourceFiles.map(file => file.absolutePath))
  );
  const hashes = new Map<string, string>();
  const concurrency = 64;

  try {
    for (let index = 0; index < sourceFiles.length; index += concurrency) {
      const batch = sourceFiles.slice(index, index + concurrency);
      const results = await Promise.all(
        batch.map(async sourcePath => ({
          sourcePath,
          hash: createHash('sha256')
            .update((await fs.promises.readFile(sourcePath)).toString('base64'))
            .digest('hex'),
        }))
      );
      for (const result of results) hashes.set(result.sourcePath, result.hash);
    }
    return hashes;
  } catch {
    return null;
  }
}

async function readMarker(
  markerPath: string
): Promise<BytecodeCacheMarker | null> {
  try {
    return parseMarker(
      JSON.parse(await fs.promises.readFile(markerPath, 'utf8'))
    );
  } catch {
    return null;
  }
}

async function getManifestIfComplete(
  marker: BytecodeCacheMarker,
  venvPath: string
): Promise<BytecodeManifestEntry[] | null> {
  const results = await Promise.all(
    marker.files.map(async file => {
      const fsPath = resolve(venvPath, file.path.replaceAll('/', sep));
      if (getVenvRelativePath(venvPath, fsPath) !== file.path) return null;
      try {
        const stats = await fs.promises.lstat(fsPath);
        return stats.isFile() && stats.size === file.size ? file : null;
      } catch {
        return null;
      }
    })
  );
  return results.some(file => file === null)
    ? null
    : results.filter(file => file !== null);
}

export class PythonBuildCache {
  private readonly rootPath: string;
  private readonly workPath: string;

  constructor({ rootPath, workPath }: PythonBuildCacheOptions) {
    this.rootPath = rootPath;
    this.workPath = workPath;
  }

  async getCompilePlan({
    venvPath,
    installedDistributions,
    pythonMajor,
    pythonMinor,
    pythonRuntime,
    mode,
    totalBundleSize,
    includePackages,
    volatilePackages = [],
  }: GetCompilePlanOptions): Promise<PythonBuildCacheCompilePlan> {
    const entries =
      installedDistributions.getBuildCacheEntries(includePackages);
    const allVendorSourceFiles = uniqueSorted(
      entries.flatMap(entry => entry.sourceFiles.map(file => file.absolutePath))
    );
    const eligible =
      pythonMajor != null &&
      pythonMinor != null &&
      mode !== 'hive' &&
      totalBundleSize <= LAMBDA_EPHEMERAL_STORAGE_BYTES;

    if (!eligible || pythonMajor == null || pythonMinor == null) {
      await this.invalidateVenv(venvPath);
      return this.uncacheablePlan(venvPath, allVendorSourceFiles);
    }

    const normalizedEntries = sortCacheEntries(venvPath, entries);
    if (!normalizedEntries) {
      await this.invalidateVenv(venvPath);
      return this.uncacheablePlan(venvPath, allVendorSourceFiles);
    }

    const volatileNames = new Set(
      volatilePackages.map(packageName => normalizePackageName(packageName))
    );
    const stableEntries = normalizedEntries.filter(
      entry =>
        entry.origin?.tag !== 'local-directory' &&
        !volatileNames.has(entry.packageName)
    );
    const volatileEntries = normalizedEntries.filter(
      entry => !stableEntries.includes(entry)
    );
    const stableSourceHashes = await hashStableSources(stableEntries);
    if (!stableSourceHashes) {
      await this.invalidateVenv(venvPath);
      return this.uncacheablePlan(venvPath, allVendorSourceFiles);
    }

    const stableVendorSourceFiles = uniqueSorted(
      stableEntries.flatMap(entry =>
        entry.sourceFiles.map(file => file.absolutePath)
      )
    );
    const volatileVendorSourceFiles = uniqueSorted(
      volatileEntries.flatMap(entry =>
        entry.sourceFiles.map(file => file.absolutePath)
      )
    );
    const cacheTag = `cpython-${pythonMajor}${pythonMinor}`;
    const expectedByPath = new Map<string, ExpectedBytecodeFile>();

    for (const entry of stableEntries) {
      for (const sourceFile of entry.sourceFiles) {
        const pycPath = derivePycPath(
          sourceFile.relativePath,
          pythonMajor,
          pythonMinor
        );
        if (!pycPath) continue;
        const fsPath = join(
          entry.sitePackagesDir,
          pycPath.replaceAll('/', sep)
        );
        const venvRelativePath = getVenvRelativePath(venvPath, fsPath);
        if (!venvRelativePath) {
          await this.invalidateVenv(venvPath);
          return this.uncacheablePlan(venvPath, allVendorSourceFiles);
        }
        expectedByPath.set(venvRelativePath, {
          path: venvRelativePath,
          fsPath,
        });
      }
    }

    const packageScope = uniqueSorted(
      normalizedEntries.map(entry => entry.packageName)
    );
    const markerWithoutFiles: Omit<BytecodeCacheMarker, 'files'> = {
      version: BUILD_CACHE_MARKER_VERSION,
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            python: {
              major: pythonMajor,
              minor: pythonMinor,
              runtime: pythonRuntime,
              cacheTag,
            },
            mode,
            packageScope,
            distributions: stableEntries.map(entry => ({
              sitePackagesPath: entry.sitePackagesPath,
              packageName: entry.packageName,
              version: entry.version,
              origin: entry.origin ?? null,
              records: entry.records,
              sources: entry.sourceFiles.map(source => ({
                path: source.relativePath,
                hash: stableSourceHashes.get(source.absolutePath),
              })),
            })),
          })
        )
        .digest('hex'),
      mode,
      python: {
        major: pythonMajor,
        minor: pythonMinor,
        runtime: pythonRuntime,
        cacheTag,
      },
      packageScope,
    };
    const expectedBytecodeFiles = [...expectedByPath.values()].sort((a, b) =>
      a.path.localeCompare(b.path)
    );
    const restoredMarker = await readMarker(this.getMarkerPath(venvPath));
    const restoredManifest = restoredMarker
      ? await getManifestIfComplete(restoredMarker, venvPath)
      : null;
    const cacheHit =
      restoredMarker?.fingerprint === markerWithoutFiles.fingerprint &&
      restoredMarker.mode === markerWithoutFiles.mode &&
      restoredMarker.python.major === markerWithoutFiles.python.major &&
      restoredMarker.python.minor === markerWithoutFiles.python.minor &&
      restoredMarker.python.runtime === markerWithoutFiles.python.runtime &&
      restoredMarker.python.cacheTag === markerWithoutFiles.python.cacheTag &&
      restoredMarker.packageScope.length === packageScope.length &&
      restoredMarker.packageScope.every(
        (packageName, index) => packageName === packageScope[index]
      ) &&
      restoredManifest !== null &&
      restoredManifest.length === expectedBytecodeFiles.length &&
      restoredManifest.every(
        (file, index) => file.path === expectedBytecodeFiles[index].path
      );

    const usableCacheHit = cacheHit && expectedBytecodeFiles.length > 0;
    if (!usableCacheHit) await this.invalidateVenv(venvPath);
    debug(
      `Python bytecode build cache ${usableCacheHit ? 'hit' : 'miss'} for ${venvPath}`
    );

    return {
      cacheable: expectedBytecodeFiles.length > 0,
      cacheHit: usableCacheHit,
      vendorSourceFiles: usableCacheHit
        ? volatileVendorSourceFiles
        : [...stableVendorSourceFiles, ...volatileVendorSourceFiles].sort(),
      stableVendorSourceFileCount: stableVendorSourceFiles.length,
      volatileVendorSourceFileCount: volatileVendorSourceFiles.length,
      venvPath,
      marker: expectedBytecodeFiles.length > 0 ? markerWithoutFiles : null,
      expectedBytecodeFiles,
    };
  }

  async commit(plan: PythonBuildCacheCompilePlan): Promise<boolean> {
    if (!plan.cacheable || plan.cacheHit || !plan.marker) return plan.cacheHit;

    const manifest = await Promise.all(
      plan.expectedBytecodeFiles.map(async file => {
        try {
          const stats = await fs.promises.lstat(file.fsPath);
          return stats.isFile() ? { path: file.path, size: stats.size } : null;
        } catch {
          return null;
        }
      })
    );
    if (manifest.some(file => file === null)) {
      await this.invalidateVenv(plan.venvPath);
      return false;
    }

    const markerPath = this.getMarkerPath(plan.venvPath);
    const tempPath = `${markerPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(
        tempPath,
        `${JSON.stringify({
          ...plan.marker,
          files: manifest.filter(file => file !== null),
        })}\n`
      );
      await fs.promises.rename(tempPath, markerPath);
      return true;
    } catch (error) {
      debug(`failed to commit Python bytecode cache marker: ${String(error)}`);
      await this.invalidateVenv(plan.venvPath);
      return false;
    } finally {
      await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  async invalidateVenv(venvPath: string): Promise<void> {
    await fs.promises
      .rm(this.getMarkerPath(venvPath), { force: true })
      .catch(error =>
        debug(`failed to invalidate Python bytecode cache: ${String(error)}`)
      );
  }

  async prepareFiles(): Promise<Files> {
    const uvCacheDir = getUvCacheDir(this.workPath);
    try {
      const uvPath = findUvInPath();
      if (uvPath) await new UvRunner(uvPath, uvCacheDir).cachePrune();
    } catch {
      // Cache pruning is best-effort and must not fail the build.
    }

    const files = await glob(
      '**/.vercel/python/{.venv,services/*/.venv,cache/uv}/**',
      {
        cwd: this.rootPath,
        ignore: [
          '**/*.pyc',
          '**/__pycache__/**',
          `**/${BUILD_CACHE_MARKER_FILENAME}`,
        ],
      }
    );
    const markerFiles = await glob(
      `**/.vercel/python/{.venv,services/*/.venv}/${BUILD_CACHE_MARKER_FILENAME}`,
      { cwd: this.rootPath }
    );

    for (const [cachePath, markerFile] of Object.entries(markerFiles)) {
      const marker = await readMarker(markerFile.fsPath);
      if (!marker) continue;
      const venvPath = dirname(markerFile.fsPath);
      const manifest = await getManifestIfComplete(marker, venvPath);
      if (!manifest) continue;

      files[cachePath] = markerFile;
      const cacheVenvPath = dirname(cachePath);
      for (const file of manifest) {
        files[join(cacheVenvPath, file.path).replaceAll(sep, '/')] =
          new FileFsRef({
            fsPath: join(venvPath, file.path.replaceAll('/', sep)),
            size: file.size,
          });
      }
    }

    return files;
  }

  private uncacheablePlan(
    venvPath: string,
    vendorSourceFiles: string[]
  ): PythonBuildCacheCompilePlan {
    return {
      cacheable: false,
      cacheHit: false,
      vendorSourceFiles,
      stableVendorSourceFileCount: 0,
      volatileVendorSourceFileCount: vendorSourceFiles.length,
      venvPath,
      marker: null,
      expectedBytecodeFiles: [],
    };
  }

  private getMarkerPath(venvPath: string): string {
    return join(venvPath, BUILD_CACHE_MARKER_FILENAME);
  }
}
