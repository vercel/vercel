import os from 'node:os';
import { promises as fs } from 'node:fs';
import { dirname, join, normalize } from 'path';

/**
 * Resolve the build concurrency limit from `VERCEL_BUILD_CONCURRENCY`.
 *
 * Accepts a positive integer, a percentage of available parallelism (`50%`),
 * or `auto` (`min(max(P - 1, 2), 8)` — mirroring the build container's own
 * `min(max(cpus, 2), 16)` idiom). Defaults to `1`, today's fully-sequential
 * behavior; any unparseable value also degrades to `1`, never to an unsafe
 * parallel run.
 *
 * Parallelism is measured with `os.availableParallelism()`, NOT
 * `os.cpus().length`: under cgroup CPU limits (the cloud build container)
 * `cpus()` reports the *host's* cores, while `availableParallelism()` respects
 * the container's actual quota.
 */
export function resolveBuildConcurrency(
  raw: string | undefined = process.env.VERCEL_BUILD_CONCURRENCY
): number {
  const value = raw?.trim();
  if (!value) return 1;
  // `os.availableParallelism()` is cgroup-aware (preferred) but was only added
  // in Node 18.14.0; fall back to `os.cpus().length` on older 18.x runtimes,
  // which the CLI's `engines` (`>= 18`) still permits.
  const parallelism = Math.max(
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length,
    1
  );
  if (value === 'auto') {
    return Math.min(Math.max(parallelism - 1, 2), 8);
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
 * Run `fn` over `items` with at most `limit` in flight — a worker pool, not
 * `Promise.all` chunks, so a fast item never idles waiting on a slow sibling
 * in its chunk.
 *
 * Fail-fast: after the first rejection no new items start; items already in
 * flight run to completion. The first error is rethrown once the pool drains;
 * errors from other in-flight items are passed to `onSecondaryError` so they
 * are reported rather than silently dropped.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
  onSecondaryError?: (err: unknown, item: T) => void
): Promise<void> {
  let index = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async (): Promise<void> => {
    while (index < items.length && !failed) {
      const item = items[index++];
      try {
        await fn(item);
      } catch (err) {
        if (failed) {
          onSecondaryError?.(err, item);
        } else {
          failed = true;
          firstError = err;
        }
      }
    }
  };
  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw firstError;
}

/**
 * Inner install-scope key for a build: the exact (resolved install directory,
 * install command) pair — the *dedup unit*. Builds sharing it run
 * the same install in the same place, so after the sub-scope's leader the rest
 * can genuinely skip. `undefined`/`null` command (the default,
 * package-manager-driven install) is distinct from an explicit empty command.
 */
export function getInstallScopeKey({
  installDirectory,
  installCommand,
}: {
  installDirectory: string;
  installCommand: string | null | undefined;
}): string {
  // NUL separator: cannot appear in a path or command, so keys never collide.
  const command =
    typeof installCommand === 'string'
      ? `cmd\u0000${installCommand.trim()}`
      : 'default';
  return `${normalize(installDirectory)}\u0000${command}`;
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
 * Resolve the *outer* install scope root for a service directory — the
 * directory a package manager invoked from `serviceDir` would actually operate
 * on. Installs of two builds may only run concurrently when their
 * roots differ; an exact-directory key alone is NOT safe, because a workspace
 * *member* install mutates the workspace *root* (one `node_modules` /
 * lockfile / `uv.lock`).
 *
 * - `node`: the nearest directory at or above `serviceDir` (up to
 *   `ceilingDir`) containing a Node lockfile, `pnpm-workspace.yaml`, or a
 *   `package.json` with a `workspaces` field.
 * - `python`: the nearest directory declaring a uv workspace
 *   (`pyproject.toml` with `[tool.uv.workspace]`) — its members share the
 *   root's `uv.lock`.
 *
 * Falls back to `serviceDir` itself (a standalone service owns its root).
 * A false positive only widens a scope (more serialization — safe); false
 * negatives are what this walk exists to prevent.
 */
export async function resolveInstallScopeRoot({
  toolchain,
  serviceDir,
  ceilingDir,
}: {
  toolchain: 'node' | 'python';
  serviceDir: string;
  ceilingDir: string;
}): Promise<string> {
  const ceiling = normalize(ceilingDir);
  let dir = normalize(serviceDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (toolchain === 'node') {
      for (const lockfile of NODE_LOCKFILES) {
        if (await fileExists(join(dir, lockfile))) return dir;
      }
      if (await fileExists(join(dir, 'pnpm-workspace.yaml'))) return dir;
      try {
        const pkg = JSON.parse(
          await fs.readFile(join(dir, 'package.json'), 'utf8')
        );
        if (pkg && typeof pkg === 'object' && 'workspaces' in pkg) return dir;
      } catch {
        // no package.json here (or unparseable) — keep walking
      }
    } else {
      try {
        const pyproject = await fs.readFile(
          join(dir, 'pyproject.toml'),
          'utf8'
        );
        if (pyproject.includes('[tool.uv.workspace]')) return dir;
      } catch {
        // no pyproject here — keep walking
      }
    }
    if (dir === ceiling) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return normalize(serviceDir);
}

/** A build's resolved two-level install scope. */
export interface InstallScope {
  /**
   * Serialization boundary: toolchain-qualified install root. Two builds with
   * different outer keys may install concurrently; within one outer scope,
   * installs run one at a time.
   */
  outerKey: string;
  /**
   * Dedup unit: exact (install directory, command). After this sub-scope's
   * leader, its remaining builds' installs are no-ops (default installs skip
   * via the pre-seeded `meta.runNpmInstallSet`).
   */
  innerKey: string;
  /**
   * A custom install command's dedup latch is per-worker, so its sub-scope's
   * extra builds cannot skip — they stay on the outer scope's chain.
   */
  customInstall: boolean;
}

/**
 * Group items into install-scope chains for the scheduler:
 *
 * - `chains`: one entry per OUTER scope, in first-seen (i.e. `sortBuilders`)
 *   order. A chain holds the leader of each inner sub-scope plus the extra
 *   builds of custom-install sub-scopes; the scheduler runs a chain's builds
 *   sequentially (they share an install root) while distinct chains run
 *   concurrently.
 * - `rest`: the remaining builds of default-install sub-scopes, in input
 *   order. They fan out once every chain has completed: by then their
 *   sub-scope leader's `meta` merge-back has made their install a no-op.
 */
export function groupIntoScopeChains<T>(
  items: readonly T[],
  scopeOf: (item: T) => InstallScope
): { chains: T[][]; rest: T[] } {
  const chainByOuter = new Map<string, T[]>();
  const seenInner = new Set<string>();
  const rest: T[] = [];
  for (const item of items) {
    const scope = scopeOf(item);
    let chain = chainByOuter.get(scope.outerKey);
    if (!chain) {
      chain = [];
      chainByOuter.set(scope.outerKey, chain);
    }
    if (!seenInner.has(scope.innerKey)) {
      seenInner.add(scope.innerKey);
      chain.push(item); // inner sub-scope leader
    } else if (scope.customInstall) {
      chain.push(item); // cannot skip its install — stays serialized
    } else {
      rest.push(item); // install becomes a no-op after its leader
    }
  }
  return { chains: Array.from(chainByOuter.values()), rest };
}
