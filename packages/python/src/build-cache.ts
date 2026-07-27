import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { debug, FileFsRef, glob, type Files } from '@vercel/build-utils';
import { normalizePackageName } from '@vercel/python-analysis';
import { COMPILE_ALL_SCRIPT_PATH, derivePycPath } from './compileall';
import { LAMBDA_EPHEMERAL_STORAGE_BYTES } from './dependency-externalizer';
import type {
  InstalledPythonDistributions,
  InstalledPythonSourceFile,
} from './installed-distributions';

export const BUILD_CACHE_MARKER_FILENAME = '.vercel-python-bytecode-cache.json';

interface BytecodeManifestEntry {
  path: string;
  size: number;
}

interface PythonBytecodeCacheMarker {
  version: 1;
  fingerprint: string;
  cacheTag: string;
  files: BytecodeManifestEntry[];
}

interface ExpectedBytecodeFile {
  path: string;
  fsPath: string;
}

interface PythonBytecodeCachePlan {
  cacheHit: boolean;
  vendorSourceFiles: string[];
  venvPath: string;
  marker: Omit<PythonBytecodeCacheMarker, 'files'> | null;
  expectedBytecodeFiles: ExpectedBytecodeFile[];
}

interface GetPythonBytecodeCachePlanOptions {
  venvPath: string;
  installedDistributions: Pick<
    InstalledPythonDistributions,
    'getPythonSourceFiles'
  >;
  pythonMajor: number | undefined;
  pythonMinor: number | undefined;
  isHive: boolean;
  totalBundleSize: number;
  includePackages?: string[];
  volatilePackages?: string[];
}

type MarkerReadResult =
  | { status: 'valid'; marker: PythonBytecodeCacheMarker }
  | { status: 'invalid' }
  | { status: 'unavailable' };

interface CompleteManifest {
  files: BytecodeManifestEntry[];
  totalSize: number;
}

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

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isCacheTag(value: unknown): value is string {
  return typeof value === 'string' && /^cpython-[1-9]\d+$/.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
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
  const segments = path.split('/');
  return (
    path.length > 0 &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    !isAbsolute(path) &&
    !/^[A-Za-z]:/.test(path) &&
    segments.every(
      segment => segment !== '' && segment !== '.' && segment !== '..'
    ) &&
    segments.includes('__pycache__') &&
    path.endsWith(`.${cacheTag}.pyc`)
  );
}

function parseManifestFiles(
  value: unknown,
  cacheTag: string
): BytecodeManifestEntry[] | null {
  if (!Array.isArray(value)) return null;

  const files: BytecodeManifestEntry[] = [];
  for (const file of value) {
    if (
      !isObject(file) ||
      !hasExactKeys(file, ['path', 'size']) ||
      typeof file.path !== 'string' ||
      !isNonNegativeInteger(file.size) ||
      !isSafeManifestPath(file.path, cacheTag)
    ) {
      return null;
    }
    files.push({ path: file.path, size: file.size });
  }

  return isSortedUnique(files.map(file => file.path)) ? files : null;
}

function parsePythonBytecodeMarker(
  value: unknown
): PythonBytecodeCacheMarker | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['cacheTag', 'files', 'fingerprint', 'version']) ||
    value.version !== 1 ||
    !isSha256(value.fingerprint) ||
    !isCacheTag(value.cacheTag)
  ) {
    return null;
  }

  const files = parseManifestFiles(value.files, value.cacheTag);
  if (!files) return null;

  return {
    version: 1,
    fingerprint: value.fingerprint,
    cacheTag: value.cacheTag,
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

async function hashFile(filePath: string): Promise<string | null> {
  try {
    const contents = await fs.promises.readFile(filePath);
    return createHash('sha256')
      .update(contents as Uint8Array)
      .digest('hex');
  } catch {
    return null;
  }
}

async function hashSourceFiles(
  sourceFiles: InstalledPythonSourceFile[]
): Promise<Map<string, string | null>> {
  const hashes = new Map<string, string | null>();
  const concurrency = 64;

  for (let index = 0; index < sourceFiles.length; index += concurrency) {
    const batch = sourceFiles.slice(index, index + concurrency);
    const batchHashes = await Promise.all(
      batch.map(async sourceFile => ({
        sourceFile,
        hash: await hashFile(sourceFile.absolutePath),
      }))
    );
    for (const { sourceFile, hash } of batchHashes) {
      hashes.set(sourceFile.absolutePath, hash);
    }
  }

  return hashes;
}

async function readMarker(markerPath: string): Promise<MarkerReadResult> {
  let contents: string;
  try {
    contents = await fs.promises.readFile(markerPath, 'utf8');
  } catch {
    return { status: 'unavailable' };
  }

  try {
    const marker = parsePythonBytecodeMarker(JSON.parse(contents));
    return marker ? { status: 'valid', marker } : { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
}

async function getCompleteManifest(
  marker: PythonBytecodeCacheMarker,
  venvPath: string
): Promise<CompleteManifest | null> {
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
  if (results.some(file => file === null)) return null;

  const files = results.filter(file => file !== null);
  return {
    files,
    totalSize: files.reduce((total, file) => total + file.size, 0),
  };
}

export async function removePythonBytecodeCacheMarker(
  venvPath: string
): Promise<void> {
  try {
    await fs.promises.rm(join(venvPath, BUILD_CACHE_MARKER_FILENAME), {
      force: true,
    });
  } catch (error) {
    debug(`failed to remove Python bytecode cache marker: ${String(error)}`);
  }
}

function makeUncacheablePlan(
  venvPath: string,
  vendorSourceFiles: string[]
): PythonBytecodeCachePlan {
  return {
    cacheHit: false,
    vendorSourceFiles,
    venvPath,
    marker: null,
    expectedBytecodeFiles: [],
  };
}

export async function getPythonBytecodeCachePlan({
  venvPath,
  installedDistributions,
  pythonMajor,
  pythonMinor,
  isHive,
  totalBundleSize,
  includePackages,
  volatilePackages = [],
}: GetPythonBytecodeCachePlanOptions): Promise<PythonBytecodeCachePlan> {
  const installedSources =
    installedDistributions.getPythonSourceFiles(includePackages);
  const allVendorSourceFiles = uniqueSorted(
    installedSources.map(source => source.absolutePath)
  );

  if (isHive || totalBundleSize > LAMBDA_EPHEMERAL_STORAGE_BYTES) {
    await removePythonBytecodeCacheMarker(venvPath);
    return makeUncacheablePlan(venvPath, allVendorSourceFiles);
  }
  if (pythonMajor == null || pythonMinor == null) {
    return makeUncacheablePlan(venvPath, allVendorSourceFiles);
  }

  const volatilePackageNames = new Set(
    volatilePackages.map(packageName => normalizePackageName(packageName))
  );
  const stableSources = installedSources.filter(
    source =>
      !source.isFromLocalDirectory &&
      !volatilePackageNames.has(source.packageName)
  );
  const volatileSourceFiles = installedSources
    .filter(source => !stableSources.includes(source))
    .map(source => source.absolutePath);
  const sourceHashes = await hashSourceFiles(stableSources);
  const compilerScriptHash = await hashFile(COMPILE_ALL_SCRIPT_PATH);
  if (!compilerScriptHash) {
    return makeUncacheablePlan(venvPath, allVendorSourceFiles);
  }

  const readableSources: {
    source: InstalledPythonSourceFile;
    venvRelativePath: string;
    hash: string;
  }[] = [];
  const unreadableSourceFiles: string[] = [];

  for (const source of stableSources) {
    const hash = sourceHashes.get(source.absolutePath);
    if (!hash) {
      unreadableSourceFiles.push(source.absolutePath);
      continue;
    }
    const venvRelativePath = getVenvRelativePath(venvPath, source.absolutePath);
    if (!venvRelativePath) {
      return makeUncacheablePlan(venvPath, allVendorSourceFiles);
    }
    readableSources.push({ source, venvRelativePath, hash });
  }
  readableSources.sort((a, b) =>
    a.venvRelativePath.localeCompare(b.venvRelativePath)
  );

  const cacheTag = `cpython-${pythonMajor}${pythonMinor}`;
  const expectedByPath = new Map<string, ExpectedBytecodeFile>();
  for (const { source } of readableSources) {
    const pycPath = derivePycPath(
      source.relativePath,
      pythonMajor,
      pythonMinor
    );
    if (!pycPath) continue;
    const fsPath = join(source.sitePackagesDir, pycPath.replaceAll('/', sep));
    const venvRelativePath = getVenvRelativePath(venvPath, fsPath);
    if (!venvRelativePath) {
      return makeUncacheablePlan(venvPath, allVendorSourceFiles);
    }
    expectedByPath.set(venvRelativePath, {
      path: venvRelativePath,
      fsPath,
    });
  }
  const expectedBytecodeFiles = [...expectedByPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  const markerWithoutFiles: Omit<PythonBytecodeCacheMarker, 'files'> = {
    version: 1,
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify({
          python: { major: pythonMajor, minor: pythonMinor },
          compilerScriptHash,
          sources: readableSources.map(({ venvRelativePath, hash }) => ({
            path: venvRelativePath,
            hash,
          })),
        })
      )
      .digest('hex'),
    cacheTag,
  };

  const markerPath = join(venvPath, BUILD_CACHE_MARKER_FILENAME);
  const markerResult = await readMarker(markerPath);
  if (markerResult.status === 'invalid') {
    await removePythonBytecodeCacheMarker(venvPath);
  }

  const restoredMarker =
    markerResult.status === 'valid' ? markerResult.marker : null;
  const restoredManifest = restoredMarker
    ? await getCompleteManifest(restoredMarker, venvPath)
    : null;
  if (restoredMarker && !restoredManifest) {
    await removePythonBytecodeCacheMarker(venvPath);
  }

  const expectedPaths = expectedBytecodeFiles.map(file => file.path);
  const restoredPaths = restoredManifest?.files.map(file => file.path);
  const cacheHit =
    expectedPaths.length > 0 &&
    restoredMarker?.fingerprint === markerWithoutFiles.fingerprint &&
    restoredMarker.cacheTag === cacheTag &&
    restoredPaths?.length === expectedPaths.length &&
    restoredPaths.every((file, index) => file === expectedPaths[index]);

  debug(
    `Python bytecode build cache ${cacheHit ? 'hit' : 'miss'} for ${venvPath}: ` +
      `persistedFiles=${restoredManifest?.files.length ?? 0} ` +
      `persistedBytes=${restoredManifest?.totalSize ?? 0}`
  );

  return {
    cacheHit,
    vendorSourceFiles: cacheHit
      ? uniqueSorted([...volatileSourceFiles, ...unreadableSourceFiles])
      : allVendorSourceFiles,
    venvPath,
    marker: expectedBytecodeFiles.length > 0 ? markerWithoutFiles : null,
    expectedBytecodeFiles,
  };
}

export async function commitPythonBytecodeCache(
  plan: PythonBytecodeCachePlan
): Promise<boolean> {
  if (plan.cacheHit) return true;
  if (!plan.marker || plan.expectedBytecodeFiles.length === 0) return false;

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
  if (manifest.some(file => file === null)) return false;

  const completeManifest = manifest.filter(file => file !== null);
  const markerPath = join(plan.venvPath, BUILD_CACHE_MARKER_FILENAME);
  const tempPath = `${markerPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(
      tempPath,
      `${JSON.stringify({
        ...plan.marker,
        files: completeManifest,
      })}\n`
    );
    await fs.promises.rename(tempPath, markerPath);
    debug(
      `Python bytecode build cache committed for ${plan.venvPath}: ` +
        `persistedFiles=${completeManifest.length} ` +
        `persistedBytes=${completeManifest.reduce(
          (total, file) => total + file.size,
          0
        )}`
    );
    return true;
  } catch (error) {
    debug(`failed to commit Python bytecode cache marker: ${String(error)}`);
    return false;
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

export async function getPythonBytecodeCacheFiles(
  rootPath: string
): Promise<Files> {
  const markerFiles = await glob(
    `**/.vercel/python/{.venv,services/*/.venv}/${BUILD_CACHE_MARKER_FILENAME}`,
    { cwd: rootPath }
  );
  const files: Files = {};

  for (const [cachePath, markerFile] of Object.entries(markerFiles)) {
    const markerResult = await readMarker(markerFile.fsPath);
    if (markerResult.status === 'invalid') {
      await removePythonBytecodeCacheMarker(dirname(markerFile.fsPath));
      continue;
    }
    if (markerResult.status !== 'valid') continue;

    const venvPath = dirname(markerFile.fsPath);
    const manifest = await getCompleteManifest(markerResult.marker, venvPath);
    if (!manifest) {
      await removePythonBytecodeCacheMarker(venvPath);
      continue;
    }

    files[cachePath] = markerFile;
    const cacheVenvPath = dirname(cachePath);
    for (const file of manifest.files) {
      files[join(cacheVenvPath, file.path).replaceAll(sep, '/')] =
        new FileFsRef({
          fsPath: join(venvPath, file.path.replaceAll('/', sep)),
          size: file.size,
        });
    }
  }

  return files;
}
