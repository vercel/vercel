import os from 'node:os';

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
