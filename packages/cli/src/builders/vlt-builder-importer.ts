import { createHash, randomBytes } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
// The vlt packages are only needed to install a Builder that is missing from
// the cache. They are loaded on demand: importing @vltpkg/graph costs more
// than the rest of importing an already installed Builder.
import type { LockfileData } from '@vltpkg/graph';
import type { PackageInfoClient } from '@vltpkg/package-info';
import type { PackageJson as VercelPackageJson } from '@vercel/build-utils';
import { getCachePath } from '@vercel/cli-config';
import type { BuilderWithPkg } from '@vercel-internals/builder-orchestration/import-builders';
import { createBuilderIndex } from './vlt-builder-graph';

const LOCK_RETRY_MS = 50;
const LOCK_WAIT_MS = 5 * 60 * 1000;
const LOCK_EMPTY_GRACE_MS = 1000;
const REMOVE_MAX_RETRIES = 5;
const REMOVE_RETRY_DELAY_MS = 100;
interface EnsuredGraph {
  root: string;
  installed: boolean;
}

const activeInstallations = new Map<string, Promise<EnsuredGraph>>();

interface EmbeddedSingleBuilderGraph {
  hash: string;
  name: string;
  version: string;
  manifest: {
    name: string;
    private: true;
    dependencies: Record<string, string>;
  };
  lockfile: LockfileData;
}

export interface EmbeddedBuilderGraphs {
  schemaVersion: 1;
  builders: Record<string, EmbeddedSingleBuilderGraph>;
}

/** Locates installed Builders without loading the full graphs. */
export interface EmbeddedBuilderIndex {
  schemaVersion: 1;
  builders: Record<string, { hash: string; version: string }>;
}

// This code-unit ordering must remain byte-identical to canonicalize() in
// generate-builder-graph.mjs, which produces hashes verified here.
function compareKeys(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => compareKeys(a, b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function validateGraph(graph: EmbeddedSingleBuilderGraph) {
  const { hash, ...contents } = graph;
  const actual = createHash('sha256')
    .update(JSON.stringify(canonicalize(contents)))
    .digest('hex');
  if (actual !== hash) {
    throw new Error(
      `The embedded vlt Builder graph for ${graph.name} is invalid.`
    );
  }
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function hasErrorCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // EPERM: the pid exists but we cannot signal it. Treat as alive so we
    // do not steal a lock from a process we simply cannot inspect.
    return hasErrorCode(error, 'EPERM');
  }
}

async function isLockHolderAlive(path: string) {
  try {
    const pid = Number.parseInt((await readFile(path, 'utf8')).trim(), 10);
    return Number.isInteger(pid) && pid > 0 && isProcessAlive(pid);
  } catch {
    return false;
  }
}

async function tryStealStaleLock(path: string, emptyGraceMs: number) {
  let first;
  try {
    first = await lstat(path);
  } catch {
    return true;
  }

  // An empty lock file may still be a live holder we cannot inspect yet.
  // Do not reclaim it until that window has closed.
  if (first.size === 0 && Date.now() - first.mtimeMs < emptyGraceMs) {
    return false;
  }

  if (await isLockHolderAlive(path)) return false;

  let second;
  try {
    second = await lstat(path);
  } catch {
    return true;
  }
  if (
    second.dev !== first.dev ||
    second.ino !== first.ino ||
    second.mtimeMs !== first.mtimeMs ||
    second.size !== first.size
  ) {
    return false;
  }

  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export async function acquireLock(
  path: string,
  {
    waitMs = LOCK_WAIT_MS,
    emptyGraceMs = LOCK_EMPTY_GRACE_MS,
  }: { waitMs?: number; emptyGraceMs?: number } = {}
) {
  await mkdir(join(path, '..'), { recursive: true });
  const startedAt = Date.now();
  while (true) {
    const tmp = `${path}.${process.pid}-${randomBytes(6).toString('hex')}`;
    await writeFile(tmp, `${process.pid}\n`, { flag: 'wx' });
    try {
      // link() fails with EEXIST instead of replacing a live lock, unlike rename().
      await link(tmp, path);
      await unlink(tmp).catch(() => undefined);
      return await open(path, 'r');
    } catch (error: unknown) {
      await unlink(tmp).catch(() => undefined);
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      if (await tryStealStaleLock(path, emptyGraceMs)) continue;
      if (Date.now() - startedAt > waitMs) {
        throw new Error(`Timed out waiting for vlt Builder lock "${path}".`);
      }
      await wait(LOCK_RETRY_MS);
    }
  }
}

async function removeInstallation(path: string) {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: REMOVE_MAX_RETRIES,
    retryDelay: REMOVE_RETRY_DELAY_MS,
  });
}

// The marker is written only after a complete installation, so a matching
// marker means the graph is installed.
async function installationComplete(root: string, hash: string) {
  try {
    return (
      (await readFile(join(root, '.vercel-builder-graph'), 'utf8')).trim() ===
      hash
    );
  } catch {
    return false;
  }
}

interface ImportSpan {
  setAttributes(attrs: Record<string, string | undefined>): void;
}

type PackageInfoFactory = (
  options: Record<string, unknown>
) => PackageInfoClient;

const defaultPackageInfoFactory = async (): Promise<PackageInfoFactory> => {
  const { PackageInfoClient } = await import('@vltpkg/package-info');
  return options => new PackageInfoClient(options);
};

/**
 * Remove the per-install vlt package-info cache without failing the install.
 *
 * vlt's registry cache writes entries to disk in the background, and
 * `install()` can resolve before those writes land. Removing the directory
 * while a write is in flight fails with ENOTEMPTY, so wait for pending writes
 * first and retry removal. The cache is disposable, so a cleanup failure must
 * not fail (or mask the error of) the install itself.
 */
export async function removePackageInfoCache(
  packageInfo: Pick<PackageInfoClient, 'getRegistryClient'>,
  path: string
) {
  try {
    const registryClient = await packageInfo.getRegistryClient();
    await registryClient.cache.promise();
  } catch {
    // Nothing to wait for; fall through to removal.
  }
  await removeInstallation(path).catch(() => undefined);
}

async function reifyGraph(
  root: string,
  graph: EmbeddedSingleBuilderGraph,
  packageInfoFactory: PackageInfoFactory | undefined
) {
  const [{ install }, { PackageJson }, { PathScurry }, createPackageInfo] =
    await Promise.all([
      import('@vltpkg/graph'),
      import('@vltpkg/package-json'),
      import('path-scurry'),
      packageInfoFactory ?? defaultPackageInfoFactory(),
    ]);
  const packageJson = new PackageJson();
  const packageInfoCache = join(root, '.vlt-package-info-cache');
  const packageInfo = createPackageInfo({
    ...graph.lockfile.options,
    projectRoot: root,
    packageJson,
    cache: packageInfoCache,
  });
  try {
    await install({
      ...graph.lockfile.options,
      projectRoot: root,
      packageJson,
      packageInfo,
      scurry: new PathScurry(root),
      allowScripts: ':not(*)',
      frozenLockfile: true,
      cleanInstall: true,
    });
  } finally {
    await removePackageInfoCache(packageInfo, packageInfoCache);
  }
}

async function ensureGraph(
  graph: EmbeddedSingleBuilderGraph,
  cacheRoot: string,
  packageInfoFactory: PackageInfoFactory | undefined
): Promise<EnsuredGraph> {
  validateGraph(graph);
  const root = join(cacheRoot, graph.hash);
  const active = activeInstallations.get(root);
  if (active) return active;

  const installation = (async () => {
    if (await installationComplete(root, graph.hash)) {
      return { root, installed: false };
    }
    const lockPath = join(cacheRoot, 'locks', `${graph.hash}.lock`);
    const lock = await acquireLock(lockPath);
    let temporaryRoot: string | undefined;
    try {
      if (await installationComplete(root, graph.hash)) {
        return { root, installed: false };
      }
      await removeInstallation(root);
      // vlt uses absolute directory junction targets on Windows, so moving a
      // completed installation would leave its node_modules links pointing at
      // the removed temporary directory. The lock protects this in-place
      // installation, and the completion marker is still written last.
      temporaryRoot =
        process.platform === 'win32'
          ? root
          : join(
              cacheRoot,
              'tmp',
              `${graph.hash}-${process.pid}-${randomBytes(6).toString('hex')}`
            );
      await mkdir(temporaryRoot, { recursive: true });
      await writeFile(
        join(temporaryRoot, 'package.json'),
        `${JSON.stringify(graph.manifest, null, 2)}\n`
      );
      await writeFile(
        join(temporaryRoot, 'vlt-lock.json'),
        `${JSON.stringify(graph.lockfile, null, 2)}\n`
      );
      await reifyGraph(temporaryRoot, graph, packageInfoFactory);
      await writeFile(
        join(temporaryRoot, '.vercel-builder-graph'),
        `${graph.hash}\n`
      );
      if (temporaryRoot !== root) {
        await mkdir(join(root, '..'), { recursive: true });
        await rename(temporaryRoot, root);
      }
      temporaryRoot = undefined;
      return { root, installed: true };
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
      if (temporaryRoot) await removeInstallation(temporaryRoot);
    }
  })();

  activeInstallations.set(root, installation);
  const clearInstallation = () => {
    if (activeInstallations.get(root) === installation) {
      activeInstallations.delete(root);
    }
  };
  void installation.then(clearInstallation, clearInstallation);
  return installation;
}

/**
 * Imports pinned Builders from the vlt cache. An installed Builder is located
 * by its graph hash from the index and required directly, the same as from
 * `node_modules`. Only a missing Builder loads the full graphs and vlt to
 * install it.
 */
export function createVltBuilderImporter({
  graphs,
  loadGraphs = async () => graphs!,
  loadIndex = async () => createBuilderIndex(await loadGraphs()),
  require,
  cacheRoot = join(getCachePath(), 'builders-vlt'),
  packageInfoFactory,
  debug = () => undefined,
}: {
  graphs?: EmbeddedBuilderGraphs;
  loadGraphs?: () => Promise<EmbeddedBuilderGraphs>;
  loadIndex?: () => Promise<EmbeddedBuilderIndex>;
  require: NodeRequire;
  cacheRoot?: string;
  packageInfoFactory?: PackageInfoFactory;
  debug?: (message: string) => void;
}) {
  const install = async (
    name: string,
    expected: { hash: string; version: string }
  ) => {
    const loadedGraphs = await loadGraphs();
    if (loadedGraphs.schemaVersion !== 1) {
      throw new Error('The embedded vlt Builder graph index is invalid.');
    }
    const graph = loadedGraphs.builders[name];
    if (!graph) throw new Error(`No pinned vlt graph exists for ${name}.`);
    if (graph.hash !== expected.hash || graph.version !== expected.version) {
      throw new Error(
        `The embedded vlt Builder index does not match the graph for ${name}.`
      );
    }
    return ensureGraph(graph, cacheRoot, packageInfoFactory);
  };

  return async function importVltBuilders(
    specs: ReadonlyMap<string, string>,
    span?: ImportSpan
  ): Promise<Map<string, BuilderWithPkg>> {
    if (specs.size === 0) return new Map();
    const index = await loadIndex();
    if (index.schemaVersion !== 1) {
      throw new Error('The embedded vlt Builder graph index is invalid.');
    }
    const builders = new Map<string, BuilderWithPkg>();
    const installedNames: string[] = [];
    const reusedNames: string[] = [];
    let ensureMs = 0;
    let requireMs = 0;

    await Promise.all(
      [...specs].map(async ([spec, name]) => {
        const graph = index.builders[name];
        if (!graph) throw new Error(`No pinned vlt graph exists for ${name}.`);
        const ensureStartedAt = performance.now();
        const cachedRoot = join(cacheRoot, graph.hash);
        const { root, installed } = (await installationComplete(
          cachedRoot,
          graph.hash
        ))
          ? { root: cachedRoot, installed: false }
          : await install(name, graph);
        ensureMs += performance.now() - ensureStartedAt;
        (installed ? installedNames : reusedNames).push(name);
        const pkgPath = require.resolve(`${name}/package.json`, {
          paths: [root],
        });
        const pkg = JSON.parse(
          await readFile(pkgPath, 'utf8')
        ) as VercelPackageJson;
        if (pkg.name !== name || pkg.version !== graph.version) {
          throw new Error(
            `The vlt Builder graph materialized ${String(pkg.name)}@${String(
              pkg.version
            )} instead of ${name}@${graph.version}.`
          );
        }
        const path = require.resolve(name, { paths: [root] });
        debug(`Resolved ${name}@${graph.version} with vlt from ${root}`);
        const requireStartedAt = performance.now();
        const builder = require(path);
        requireMs += performance.now() - requireStartedAt;
        builders.set(spec, {
          path,
          pkgPath,
          pkg: { ...pkg, name },
          builder,
          dynamicallyInstalled: true,
        });
      })
    );
    span?.setAttributes({
      'builders.vlt.installed': installedNames.sort().join(','),
      'builders.vlt.reused': reusedNames.sort().join(','),
      'builders.vlt.ensureMs': String(Math.round(ensureMs)),
      'builders.vlt.requireMs': String(Math.round(requireMs)),
    });
    return builders;
  };
}
