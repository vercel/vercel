import os from 'node:os';
import { promises as fs } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

/**
 * Cap for `auto` concurrency: every worker is a forked Node process running a
 * full build, so memory scales with the worker count.
 */
const MAX_AUTO_CONCURRENCY = 8;

/**
 * Resolve the build concurrency limit from `VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY`:
 * 1. an explicit value (`4`)
 * 2. a percentage of available parallelism (`50%`)
 * 3. `auto` (`min(max(P - 1, 2), MAX_AUTO_CONCURRENCY, P)`)
 * Unset or unparseable values default to `1` (sequential builds).
 */
export function resolveBuildConcurrency(
  raw: string | undefined = process.env.VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY
): number {
  const value = raw?.trim();
  if (!value) return 1;
  // Prefer cgroup-aware `os.availableParallelism` if it's available.
  const parallelism = Math.max(
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length,
    1
  );
  if (value.toLowerCase() === 'auto') {
    return Math.min(
      Math.max(parallelism - 1, 2),
      MAX_AUTO_CONCURRENCY,
      parallelism
    );
  }
  if (value.endsWith('%')) {
    const pct = Number(value.slice(0, -1));
    if (Number.isFinite(pct) && pct > 0) {
      return Math.max(1, Math.floor((parallelism * pct) / 100));
    }
    return 1;
  }
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Run `fn` over `items` with at most `limit` in flight.
 *
 * The first error is rethrown, and later errors go to
 * `onSecondaryError`.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, enqueue: (item: T) => void) => Promise<void>,
  onSecondaryError?: (err: unknown, item: T) => void
): Promise<void> {
  const queue = [...items];
  const max = Math.max(limit, 1);
  let active = 0;
  let failed = false;
  let firstError: unknown;
  await new Promise<void>(finish => {
    const enqueue = (item: T): void => {
      queue.push(item);
      pump();
    };
    const pump = (): void => {
      while (active < max && queue.length > 0 && !failed) {
        const item = queue.shift()!;
        active++;
        fn(item, enqueue).then(
          () => {
            active--;
            pump();
          },
          err => {
            active--;
            if (failed) {
              onSecondaryError?.(err, item);
            } else {
              failed = true;
              firstError = err;
            }
            pump();
          }
        );
      }
      if (active === 0) finish();
    };
    pump();
  });
  if (failed) throw firstError;
}

/**
 * Create the inner install-scope key (toolchain, install directory, install command)
 * used to dedup installs so builds sharing it run the same install in the same place,
 * so after the sub-scope's leader the rest can skip it.
 */
export function getInstallScopeKey({
  toolchain,
  installDirectory,
  installCommand,
}: {
  toolchain: string;
  installDirectory: string;
  installCommand: string | null | undefined;
}): string {
  return JSON.stringify([
    toolchain,
    normalize(installDirectory),
    typeof installCommand === 'string'
      ? ['cmd', installCommand.trim()]
      : 'default',
  ]);
}

const NODE_LOCKFILES = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'bun.lock',
  'bun.lockb',
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Toolchains whose installs only mutate the service's own directory,
 * so cross-directory services may build concurrently.
 */
const SERVICE_DIR_TOOLCHAINS = new Set(['go', 'ruby', 'rust', 'container']);

/**
 * Resolve the outer install scope root for a service directory which is
 * the directory a package manager invoked from `serviceDir` actually operates on.
 */
export async function resolveInstallScopeRoot({
  toolchain,
  serviceDir,
  ceilingDir,
}: {
  toolchain: string;
  serviceDir: string;
  ceilingDir: string;
}): Promise<string> {
  if (toolchain !== 'node' && toolchain !== 'python') {
    return SERVICE_DIR_TOOLCHAINS.has(toolchain)
      ? normalize(serviceDir)
      : normalize(ceilingDir);
  }

  const ceiling = normalize(ceilingDir);
  let dir = normalize(serviceDir);
  // Bail if the walk can't stop at the ceiling: it would escape toward the
  // filesystem root and pick up unrelated markers (e.g. $HOME/package.json).
  if (dir !== ceiling && !dir.startsWith(ceiling + sep)) {
    return dir;
  }

  let nearestLockfileDir: string | undefined;
  let nearestPackageJsonDir: string | undefined;
  let done = false;
  while (!done) {
    if (toolchain === 'node') {
      if (nearestLockfileDir === undefined) {
        for (const lockfile of NODE_LOCKFILES) {
          if (await fileExists(join(dir, lockfile))) {
            nearestLockfileDir = dir;
            break;
          }
        }
      }
      if (await fileExists(join(dir, 'pnpm-workspace.yaml'))) return dir;
      try {
        const pkg = JSON.parse(
          await fs.readFile(join(dir, 'package.json'), 'utf8')
        );
        if (pkg && typeof pkg === 'object') {
          if ('workspaces' in pkg) return dir;
          nearestPackageJsonDir ??= dir;
        }
      } catch {
        // no package.json here (or unparseable), so keep walking
      }
    } else {
      try {
        const pyproject = await fs.readFile(
          join(dir, 'pyproject.toml'),
          'utf8'
        );
        // Just a quick check that we have a workspace project
        // that we should be aware of.
        if (pyproject.includes('[tool.uv.workspace]')) return dir;
      } catch {
        // no pyproject here, so keep walking
      }
    }
    const parent = dirname(dir);
    done = dir === ceiling || parent === dir;
    dir = parent;
  }
  return nearestLockfileDir ?? nearestPackageJsonDir ?? normalize(serviceDir);
}

/** A build's resolved two-level install scope. */
export interface InstallScope {
  /**
   * Toolchain-qualified install root as Serialization boundary where 2 builds
   * with different outer keys may install concurrently.
   */
  outerKey: string;
  /**
   * Dedup unit, after this sub-scope's leader, its remaining builds'
   * installs are no-ops.
   */
  innerKey: string;
  /**
   * Whether this sub-scope's non-leader builds may fan out concurrently.
   */
  siblingsSkipInstall: boolean;
}

export interface RunBuildsWithConcurrencyOptions<T> {
  builds: readonly T[];
  concurrency: number;
  /** Whether a build may run in a forked worker. */
  isEligible(build: T): boolean;
  /** Only called for eligible builds when `forceSingleChain` is false. */
  resolveScope(build: T): Promise<InstallScope>;
  /**
   * Run every eligible build on one chain for builds that read shared state
   * from siblings writes.
   */
  forceSingleChain: boolean;
  runBuild(build: T, concurrent: boolean): Promise<void>;
  log(message: string): void;
  reportSecondaryError(err: unknown, build: T): void;
}

/**
 * The build scheduler that runs builds concurrently while installs sharing a
 * scope stay serialized.
 *
 * Ineligible builds run sequentially after the parallel phase, matching their
 * `sortBuilders` position.
 */
export async function runBuildsWithConcurrency<T>({
  builds,
  concurrency,
  isEligible,
  resolveScope,
  forceSingleChain,
  runBuild,
  log,
  reportSecondaryError,
}: RunBuildsWithConcurrencyOptions<T>): Promise<void> {
  if (concurrency <= 1) {
    for (const build of builds) {
      await runBuild(build, false);
    }
    return;
  }

  const parallelBuilds: T[] = [];
  const sequentialBuilds: T[] = [];
  for (const build of builds) {
    (isEligible(build) ? parallelBuilds : sequentialBuilds).push(build);
  }

  if (parallelBuilds.length > 0) {
    let chains: T[][];
    let siblingsOf: Map<T, T[]>;
    if (forceSingleChain) {
      chains = [parallelBuilds];
      siblingsOf = new Map();
    } else {
      const scopeByBuild = new Map<T, InstallScope>();
      for (const build of parallelBuilds) {
        scopeByBuild.set(build, await resolveScope(build));
      }
      ({ chains, siblingsOf } = groupIntoScopeChains(
        parallelBuilds,
        build => scopeByBuild.get(build)!
      ));
    }

    log(
      `Running ${parallelBuilds.length} builds across ${chains.length} install scope${chains.length === 1 ? '' : 's'} (concurrency ${concurrency})`
    );
    let abortedRun = false;
    const activeBuildOfChain = new Map<T[], T>();

    // Chains run concurrently, builds within a chain sequentially. When a
    // build with deferred siblings finishes, its meta merge-back has made
    // their installs no-ops, so they join the pool as single-build chains.
    await runWithConcurrency(
      chains,
      concurrency,
      async (chain, enqueue) => {
        for (const build of chain) {
          if (abortedRun) return;
          activeBuildOfChain.set(chain, build);
          try {
            await runBuild(build, true);
          } catch (err) {
            abortedRun = true;
            throw err;
          }
          const siblings = siblingsOf.get(build);
          if (siblings) {
            for (const sibling of siblings) enqueue([sibling]);
          }
        }
      },
      (err, chain) => {
        const build = activeBuildOfChain.get(chain);
        if (build !== undefined) reportSecondaryError(err, build);
      }
    );
  }

  // In-process-only builds run AFTER the parallel phase.
  for (const build of sequentialBuilds) {
    await runBuild(build, false);
  }
}

/**
 * Group items into install-scope chains.
 *
 * `chains` holds one entry per OUTER scope in first-seen order,
 * `siblingsOf` maps a leader to the deferred siblings, so they
 * are runnable as soon as that leader finishes.
 */
export function groupIntoScopeChains<T>(
  items: readonly T[],
  scopeOf: (item: T) => InstallScope
): { chains: T[][]; siblingsOf: Map<T, T[]> } {
  const chainByOuter = new Map<string, T[]>();
  const leaderByInnerByOuter = new Map<string, Map<string, T>>();
  const siblingsOf = new Map<T, T[]>();
  for (const item of items) {
    const scope = scopeOf(item);
    let chain = chainByOuter.get(scope.outerKey);
    if (!chain) {
      chain = [];
      chainByOuter.set(scope.outerKey, chain);
    }

    let leaderByInner = leaderByInnerByOuter.get(scope.outerKey);
    if (!leaderByInner) {
      leaderByInner = new Map();
      leaderByInnerByOuter.set(scope.outerKey, leaderByInner);
    }

    const leader = leaderByInner.get(scope.innerKey);
    if (leader === undefined) {
      leaderByInner.set(scope.innerKey, item);
      chain.push(item); // inner sub-scope leader
    } else if (scope.siblingsSkipInstall) {
      // Install becomes a no-op after its leader.
      let siblings = siblingsOf.get(leader);
      if (!siblings) {
        siblings = [];
        siblingsOf.set(leader, siblings);
      }
      siblings.push(item);
    } else {
      chain.push(item); // install would re-run
    }
  }
  return { chains: Array.from(chainByOuter.values()), siblingsOf };
}
