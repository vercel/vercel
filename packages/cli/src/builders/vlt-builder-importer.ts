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
import { install } from '@vltpkg/graph';
import type { LockfileData } from '@vltpkg/graph';
import { PackageInfoClient } from '@vltpkg/package-info';
import { PackageJson } from '@vltpkg/package-json';
import type { PackageJson as VercelPackageJson } from '@vercel/build-utils';
import { getCachePath } from '@vercel/cli-config';
import type { BuilderWithPkg } from '@vercel-internals/builder-orchestration/import-builders';
import { PathScurry } from 'path-scurry';

const LOCK_RETRY_MS = 50;
const LOCK_WAIT_MS = 5 * 60 * 1000;
const LOCK_EMPTY_GRACE_MS = 1000;
export const TARBALL_FETCH_TIMEOUT_MS = 2 * 60 * 1000;
const activeInstallations = new Map<string, Promise<string>>();

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

async function installationComplete(
  root: string,
  graph: EmbeddedSingleBuilderGraph
) {
  try {
    return (
      (await readFile(join(root, '.vercel-builder-graph'), 'utf8')).trim() ===
      graph.hash
    );
  } catch {
    return false;
  }
}

type PackageInfoFactory = (
  options: Record<string, unknown>
) => PackageInfoClient;

export class EmbeddedPackageInfoClient extends PackageInfoClient {
  constructor(
    options?: Record<string, unknown>,
    readonly fetchTimeoutMs = TARBALL_FETCH_TIMEOUT_MS
  ) {
    super(options);
  }

  async extract(
    ...args: Parameters<PackageInfoClient['extract']>
  ): ReturnType<PackageInfoClient['extract']> {
    const [rawSpec, target, rawOptions = {}] = args;
    const spec = rawSpec as { final?: { type?: string } };
    const options = rawOptions as { integrity?: string; resolved?: string };
    if (spec.final?.type === 'remote' && options.resolved) {
      if (!options.integrity) {
        throw new Error(
          `Missing integrity for remote Builder dependency ${options.resolved}`
        );
      }
      let response: Response;
      try {
        response = await fetch(options.resolved, {
          signal: AbortSignal.timeout(this.fetchTimeoutMs),
        });
      } catch (error: unknown) {
        const aborted =
          error instanceof Error &&
          (error.name === 'TimeoutError' || error.name === 'AbortError');
        if (aborted) {
          throw new Error(
            `Timed out downloading remote Builder dependency ${options.resolved}`
          );
        }
        throw error;
      }
      if (!response.ok) {
        throw new Error(
          `Could not download remote Builder dependency ${options.resolved}: ${response.status}`
        );
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const integrity = `sha512-${createHash('sha512')
        .update(new Uint8Array(bytes))
        .digest('base64')}`;
      if (options.integrity !== integrity) {
        throw new Error(
          `Integrity check failed for remote Builder dependency ${options.resolved}`
        );
      }
      const prototype = PackageInfoClient.prototype as PackageInfoClient & {
        getTarPool(): Promise<{
          unpack(bytes: Uint8Array, target: string): Promise<void>;
        }>;
      };
      await (await prototype.getTarPool.call(this)).unpack(
        new Uint8Array(bytes),
        target
      );
      return { resolved: options.resolved, integrity, spec: rawSpec };
    }
    return super.extract(...args);
  }
}

async function reifyGraph(
  root: string,
  graph: EmbeddedSingleBuilderGraph,
  packageInfoFactory: PackageInfoFactory
) {
  const packageJson = new PackageJson();
  const packageInfo = packageInfoFactory({
    ...graph.lockfile.options,
    projectRoot: root,
    packageJson,
  });
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
}

async function ensureGraph(
  graph: EmbeddedSingleBuilderGraph,
  cacheRoot: string,
  packageInfoFactory: PackageInfoFactory
) {
  validateGraph(graph);
  const root = join(cacheRoot, graph.hash);
  const active = activeInstallations.get(root);
  if (active) return active;

  const installation = (async () => {
    if (await installationComplete(root, graph)) return root;
    const lockPath = join(cacheRoot, 'locks', `${graph.hash}.lock`);
    const lock = await acquireLock(lockPath);
    let temporaryRoot: string | undefined;
    try {
      if (await installationComplete(root, graph)) return root;
      await rm(root, { recursive: true, force: true });
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
      return root;
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
      if (temporaryRoot)
        await rm(temporaryRoot, { recursive: true, force: true });
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

export function createVltBuilderImporter({
  graphs,
  loadGraphs = async () => graphs!,
  require,
  cacheRoot = join(getCachePath(), 'builders-vlt'),
  packageInfoFactory = options => new EmbeddedPackageInfoClient(options),
  debug = () => undefined,
}: {
  graphs?: EmbeddedBuilderGraphs;
  loadGraphs?: () => Promise<EmbeddedBuilderGraphs>;
  require: NodeRequire;
  cacheRoot?: string;
  packageInfoFactory?: PackageInfoFactory;
  debug?: (message: string) => void;
}) {
  return async function importVltBuilders(
    specs: ReadonlyMap<string, string>
  ): Promise<Map<string, BuilderWithPkg>> {
    if (specs.size === 0) return new Map();
    const loadedGraphs = await loadGraphs();
    if (loadedGraphs.schemaVersion !== 1) {
      throw new Error('The embedded vlt Builder graph index is invalid.');
    }
    const builders = new Map<string, BuilderWithPkg>();

    await Promise.all(
      [...specs].map(async ([spec, name]) => {
        const graph = loadedGraphs.builders[name];
        if (!graph) throw new Error(`No pinned vlt graph exists for ${name}.`);
        const root = await ensureGraph(graph, cacheRoot, packageInfoFactory);
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
        builders.set(spec, {
          path,
          pkgPath,
          pkg: { ...pkg, name },
          builder: require(path),
          dynamicallyInstalled: true,
        });
      })
    );
    return builders;
  };
}
