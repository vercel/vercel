import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { debug, FileFsRef, glob, type Files } from '@vercel/build-utils';
import { normalizePackageName } from '@vercel/python-analysis';
import { COMPILE_ALL_SCRIPT_PATH, derivePycPath } from './compileall';
import { LAMBDA_EPHEMERAL_STORAGE_BYTES } from './dependency-externalizer';
import type {
  DistributionCacheEntry,
  InstalledPythonDistributions,
} from './installed-distributions';
import { findUvInPath, getUvCacheDir, UvRunner } from './uv';

export const BUILD_CACHE_MARKER_FILENAME = '.vercel-python-bytecode-cache.json';

interface BytecodeManifestEntry {
  path: string;
  size: number;
}

interface BytecodeCacheMarker {
  fingerprint: string;
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
  isHive: boolean;
  totalBundleSize: number;
  includePackages?: string[];
  volatilePackages?: string[];
}

interface PrepareFilesOptions {
  includeBytecode: boolean;
}

type MarkerReadResult =
  | { status: 'valid'; marker: BytecodeCacheMarker }
  | { status: 'invalid' }
  | { status: 'unavailable' };

export function isPythonBytecodeBuildCacheEnabled(): boolean {
  return process.env.VERCEL_PYTHON_BYTECODE_BUILD_CACHE === '1';
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
    !hasExactKeys(value, ['files', 'fingerprint', 'packageScope', 'python'])
  ) {
    return null;
  }

  const { files: markerFiles, fingerprint, packageScope, python } = value;
  if (
    typeof fingerprint !== 'string' ||
    !Array.isArray(packageScope) ||
    !isObject(python) ||
    !Array.isArray(markerFiles)
  ) {
    return null;
  }

  const hasValidFingerprint = /^[a-f0-9]{64}$/.test(fingerprint);
  const hasOnlyPackageNames = packageScope.every(
    item => typeof item === 'string'
  );
  const hasValidPythonShape = hasExactKeys(python, [
    'cacheTag',
    'major',
    'minor',
    'runtime',
  ]);
  if (!hasValidFingerprint || !hasOnlyPackageNames || !hasValidPythonShape) {
    return null;
  }

  const packageNames = packageScope as string[];
  const hasValidPackageScope = isSortedUnique(packageNames);
  const { cacheTag, major, minor, runtime } = python;
  if (
    typeof major !== 'number' ||
    typeof minor !== 'number' ||
    typeof runtime !== 'string' ||
    typeof cacheTag !== 'string'
  ) {
    return null;
  }

  const hasValidPythonVersion =
    Number.isSafeInteger(major) &&
    major >= 0 &&
    Number.isSafeInteger(minor) &&
    minor >= 0;
  const hasValidRuntime = runtime.length > 0;
  const hasValidCacheTag = cacheTag === `cpython-${major}${minor}`;
  if (
    !hasValidPackageScope ||
    !hasValidPythonVersion ||
    !hasValidRuntime ||
    !hasValidCacheTag
  ) {
    return null;
  }

  const files: BytecodeManifestEntry[] = [];
  for (const file of markerFiles) {
    if (
      !isObject(file) ||
      !hasExactKeys(file, ['path', 'size']) ||
      typeof file.path !== 'string' ||
      typeof file.size !== 'number'
    ) {
      return null;
    }

    const hasValidSize = Number.isSafeInteger(file.size) && file.size >= 0;
    const hasValidPath = isSafeManifestPath(file.path, cacheTag);
    if (!hasValidSize || !hasValidPath) return null;

    files.push({ path: file.path, size: file.size });
  }
  if (files.length === 0 || !isSortedUnique(files.map(file => file.path))) {
    return null;
  }

  return {
    fingerprint,
    python: {
      major,
      minor,
      runtime,
      cacheTag,
    },
    packageScope: packageNames,
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
): Promise<Map<string, string | null>> {
  const sourceFiles = uniqueSorted(
    entries.flatMap(entry => entry.sourceFiles.map(file => file.absolutePath))
  );
  const hashes = new Map<string, string | null>();
  const concurrency = 64;

  for (let index = 0; index < sourceFiles.length; index += concurrency) {
    const batch = sourceFiles.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async sourcePath => {
        try {
          const source = await fs.promises.readFile(sourcePath);
          return {
            sourcePath,
            hash: createHash('sha256')
              .update(source as Uint8Array)
              .digest('hex'),
          };
        } catch {
          return { sourcePath, hash: null };
        }
      })
    );
    for (const result of results) hashes.set(result.sourcePath, result.hash);
  }
  return hashes;
}

async function hashCompilerScript(): Promise<string | null> {
  try {
    const source = await fs.promises.readFile(COMPILE_ALL_SCRIPT_PATH);
    return createHash('sha256')
      .update(source as Uint8Array)
      .digest('hex');
  } catch {
    return null;
  }
}

async function readMarker(markerPath: string): Promise<MarkerReadResult> {
  let contents: string;
  try {
    contents = await fs.promises.readFile(markerPath, 'utf8');
  } catch {
    return { status: 'unavailable' };
  }

  try {
    const marker = parseMarker(JSON.parse(contents));
    return marker ? { status: 'valid', marker } : { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
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
    isHive,
    totalBundleSize,
    includePackages,
    volatilePackages = [],
  }: GetCompilePlanOptions): Promise<PythonBuildCacheCompilePlan> {
    const entries =
      installedDistributions.getBuildCacheEntries(includePackages);
    const allVendorSourceFiles = uniqueSorted(
      entries.flatMap(entry => entry.sourceFiles.map(file => file.absolutePath))
    );
    // Hive is excluded as a conservative rollout choice, not for correctness.
    const eligible =
      pythonMajor != null &&
      pythonMinor != null &&
      !isHive &&
      totalBundleSize <= LAMBDA_EPHEMERAL_STORAGE_BYTES;

    if (!eligible || pythonMajor == null || pythonMinor == null) {
      return this.uncacheablePlan(venvPath, allVendorSourceFiles);
    }

    const normalizedEntries = sortCacheEntries(venvPath, entries);
    if (!normalizedEntries) {
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
    const compilerScriptHash = await hashCompilerScript();
    if (!compilerScriptHash) {
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
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            python: {
              major: pythonMajor,
              minor: pythonMinor,
              runtime: pythonRuntime,
              cacheTag,
            },
            packageScope,
            compilerScriptHash,
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
    const markerResult = await readMarker(this.getMarkerPath(venvPath));
    if (markerResult.status === 'invalid') {
      await this.removeMarker(venvPath);
    }
    const restoredMarker =
      markerResult.status === 'valid' ? markerResult.marker : null;
    const restoredManifest = restoredMarker
      ? await getManifestIfComplete(restoredMarker, venvPath)
      : null;
    const expectedPaths = new Set(expectedBytecodeFiles.map(file => file.path));
    const cacheHit =
      restoredMarker?.fingerprint === markerWithoutFiles.fingerprint &&
      restoredMarker.python.major === markerWithoutFiles.python.major &&
      restoredMarker.python.minor === markerWithoutFiles.python.minor &&
      restoredMarker.python.runtime === markerWithoutFiles.python.runtime &&
      restoredMarker.python.cacheTag === markerWithoutFiles.python.cacheTag &&
      restoredMarker.packageScope.length === packageScope.length &&
      restoredMarker.packageScope.every(
        (packageName, index) => packageName === packageScope[index]
      ) &&
      restoredManifest !== null &&
      restoredManifest.length > 0 &&
      restoredManifest.every(file => expectedPaths.has(file.path));

    const usableCacheHit = cacheHit && expectedBytecodeFiles.length > 0;
    // Valid markers are self-validating. A venv stores one marker, so eligible
    // functions with different fingerprints still have last-writer-wins reuse.
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
    const completedManifest = manifest.filter(file => file !== null);
    if (completedManifest.length === 0) return false;

    const markerPath = this.getMarkerPath(plan.venvPath);
    const tempPath = `${markerPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(
        tempPath,
        `${JSON.stringify({
          ...plan.marker,
          files: completedManifest,
        })}\n`
      );
      await fs.promises.rename(tempPath, markerPath);
      return true;
    } catch (error) {
      debug(`failed to commit Python bytecode cache marker: ${String(error)}`);
      return false;
    } finally {
      await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  private async removeMarker(venvPath: string): Promise<void> {
    await fs.promises
      .rm(this.getMarkerPath(venvPath), { force: true })
      .catch(error =>
        debug(
          `failed to remove invalid Python bytecode marker: ${String(error)}`
        )
      );
  }

  async prepareFiles({ includeBytecode }: PrepareFilesOptions): Promise<Files> {
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
    if (!includeBytecode) return files;

    const markerFiles = await glob(
      `**/.vercel/python/{.venv,services/*/.venv}/${BUILD_CACHE_MARKER_FILENAME}`,
      { cwd: this.rootPath }
    );

    for (const [cachePath, markerFile] of Object.entries(markerFiles)) {
      const markerResult = await readMarker(markerFile.fsPath);
      if (markerResult.status !== 'valid') continue;
      const marker = markerResult.marker;
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
