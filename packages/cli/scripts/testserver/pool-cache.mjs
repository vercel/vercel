// The checkout-local pool of Testserver sandboxes that runs reuse (see
// pool.mjs): the cache file of sandbox configs, the lock that keeps a second
// run off it, the pending files where a run without the lock records what it
// created, and the health check that decides which cached sandboxes a run can
// use. All of it lives in one directory (poolPaths()).
import {
  closeSync,
  existsSync,
  fstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The pool's files in `dir`: the cache, its lock, and the directory of
 * pending files, one `<pid>.json` per run that created sandboxes without the
 * lock.
 */
export function poolPaths(dir) {
  return {
    cache: join(dir, 'sandboxes.json'),
    lock: join(dir, 'sandboxes.json.lock'),
    pending: join(dir, 'pending'),
  };
}

// Don't start a run on a sandbox that may expire before it ends.
export const MIN_REMAINING_MINUTES = 30;

function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return m >= 60
    ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
    : `${m}m`;
}

/** Minutes until the sandbox expires, or undefined if the cache doesn't say. */
function remainingMinutes(config) {
  const created = Date.parse(config?.created ?? '');
  if (Number.isNaN(created) || typeof config.ttl !== 'number') return undefined;
  return config.ttl / 60 - (Date.now() - created) / 60_000;
}

async function isAlive(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** The sandbox configs cached at `path`; none when it is missing or corrupt. */
export function readPoolCache(path) {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const list = Array.isArray(data?.sandboxes) ? data.sandboxes : [];
    return list.filter(config => typeof config?.testserver === 'string');
  } catch {
    // A corrupt cache is the same as no cache.
    return [];
  }
}

/** Replace the cache at `path` with `sandboxes`. */
export function writePoolCache(sandboxes, path) {
  mkdirSync(dirname(path), { recursive: true });
  // Write then rename, so an interrupted run never leaves a truncated cache.
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify({ sandboxes }, null, 2)}\n`);
  renameSync(tmpPath, path);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // Only ESRCH proves absence. EPERM and unexpected errors must not let
    // a caller reclaim a lock that may still have a live owner.
    return err?.code !== 'ESRCH';
  }
}

/**
 * Create the lock at `path` holding `pid`, or return false when it exists.
 * The pid is written to a temp file first and hard-linked into place, so the
 * lock never exists without its pid: a reader can't see it empty and take it
 * for a stale one.
 */
function tryCreateLock(path, pid) {
  const tmpPath = `${path}.${pid}.tmp`;
  writeFileSync(tmpPath, `${pid}\n`);
  try {
    linkSync(tmpPath, path);
    return true;
  } catch (err) {
    if (err?.code === 'EEXIST') return false;
    throw err;
  } finally {
    rmSync(tmpPath, { force: true });
  }
}

/**
 * Serialize stale removers, then verify both death and file identity before
 * unlinking. A holder can release and exit while we check its pid, allowing
 * another run to acquire the path. Keeping the old file open prevents inode
 * reuse, so the final identity check cannot mistake that new lock for ours.
 * Once it matches, the dead owner cannot release it and the guard excludes
 * other removers. No live lock is ever moved out of the way.
 *
 * Never steal the guard: that would recreate the same reclamation race. A
 * process killed here can leave it behind; free-lock acquisition still works,
 * but stale recovery then requires manual cleanup with all runs stopped.
 */
function breakStaleLock(path, isPidAlive) {
  const guard = `${path}.reclaim`;
  try {
    mkdirSync(guard);
  } catch (err) {
    if (err?.code === 'EEXIST') return;
    throw err;
  }
  try {
    let fd;
    try {
      fd = openSync(path, 'r');
    } catch (err) {
      if (err?.code === 'ENOENT') return;
      throw err;
    }
    try {
      const holder = Number(readFileSync(fd, 'utf8'));
      if (Number.isInteger(holder) && holder > 0 && isPidAlive(holder)) return;
      const opened = fstatSync(fd, { bigint: true });
      let current;
      try {
        current = statSync(path, { bigint: true });
      } catch (err) {
        if (err?.code === 'ENOENT') return;
        throw err;
      }
      if (opened.dev === current.dev && opened.ino === current.ino) {
        rmSync(path);
      }
    } finally {
      closeSync(fd);
    }
  } finally {
    rmdirSync(guard);
  }
}

/**
 * Take the pool lock at `path` for this process. Two runs sharing the cache
 * would put 8 workers on each shared sandbox, and one run's cache write could
 * drop a sandbox the other just created. A lock left by a dead process is
 * replaced. Returns `{ release }`, or `{ heldBy }` when the pool is unavailable.
 * `heldBy` is undefined when reclamation is guarded or acquisition loses a race.
 * `isPidAlive` is replaceable to test process-lifetime interleavings.
 */
export function acquirePoolLock(
  path,
  pid = process.pid,
  { isPidAlive = pidAlive } = {}
) {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (tryCreateLock(path, pid)) {
      let released = false;
      return {
        release: () => {
          if (released) return;
          released = true;
          try {
            if (Number(readFileSync(path, 'utf8')) === pid) rmSync(path);
          } catch {
            // Already gone.
          }
        },
      };
    }
    let content;
    try {
      content = readFileSync(path, 'utf8');
    } catch (err) {
      if (err?.code === 'ENOENT') continue; // Released; try again.
      throw err;
    }
    const holder = Number(content);
    if (Number.isInteger(holder) && holder > 0 && isPidAlive(holder)) {
      return { heldBy: holder };
    }
    breakStaleLock(path, isPidAlive);
  }
  return { heldBy: undefined };
}

/**
 * Record `sandboxes`, created by a run that didn't get the pool lock, in
 * `<pid>.json` under `dir`, replacing what that run recorded before. Called
 * as each sandbox is created, so they reach the pool however the run ends:
 * the next run that holds the lock adopts them (adoptPendingSandboxes()).
 */
export function writePendingSandboxes(sandboxes, dir, pid = process.pid) {
  if (sandboxes.length === 0) return;
  writePoolCache(sandboxes, join(dir, `${pid}.json`));
}

/**
 * Move the sandboxes in the pending files under `pendingDir` into the cache
 * at `cachePath`, skipping what is already cached, and delete those files.
 * Call only while holding the pool lock. A file whose run is still alive is
 * left alone, as that run may be using its sandboxes, unless it is older
 * than `maxAgeMs`: then its pid has been reused and its sandboxes have
 * expired. Returns the number of sandboxes added.
 */
export function adoptPendingSandboxes(
  cachePath,
  pendingDir,
  { maxAgeMs, now = Date.now() }
) {
  let names;
  try {
    names = readdirSync(pendingDir);
  } catch {
    return 0; // No pending directory: nothing to adopt.
  }
  const adoptable = [];
  for (const name of names) {
    const match = /^(\d+)\.json$/.exec(name);
    if (!match) continue;
    const path = join(pendingDir, name);
    const pid = Number(match[1]);
    if (pid !== process.pid && pidAlive(pid)) {
      let ageMs;
      try {
        ageMs = now - statSync(path).mtimeMs;
      } catch {
        continue;
      }
      if (ageMs < maxAgeMs) continue;
    }
    adoptable.push(path);
  }
  if (adoptable.length === 0) return 0;
  const cached = readPoolCache(cachePath);
  const known = new Set(cached.map(config => config.testserver));
  const added = [];
  for (const path of adoptable) {
    for (const config of readPoolCache(path)) {
      if (known.has(config.testserver)) continue;
      known.add(config.testserver);
      added.push(config);
    }
  }
  if (added.length > 0) writePoolCache([...cached, ...added], cachePath);
  // After the cache write: a run that dies in between leaves the files, and
  // the next adoption skips what is already cached.
  for (const path of adoptable) rmSync(path, { force: true });
  return added.length;
}

/**
 * Sort health-checked cache entries (`{ config, alive }[]`). `usable` holds
 * the live sandboxes with at least MIN_REMAINING_MINUTES left, freshest first.
 * `retained` holds the ones that failed the check but have that much left: a
 * slow check is no proof the sandbox is gone, so they stay cached for later
 * runs without being used in this one. Everything else is dropped.
 */
export function triageCachedSandboxes(checks) {
  const usable = [];
  const retained = [];
  for (const { config, alive } of checks) {
    const left = remainingMinutes(config);
    if (!alive) {
      if (left !== undefined && left >= MIN_REMAINING_MINUTES) {
        console.error(
          `✗ Cached testserver ${config.testserver} did not respond; keeping it cached but not using it this run`
        );
        retained.push(config);
      } else {
        console.error(
          `✗ Cached testserver ${config.testserver} did not respond`
        );
      }
    } else if (left === undefined) {
      console.error(
        `✗ Cached testserver ${config.testserver} has no created/ttl; not using it`
      );
    } else if (left < MIN_REMAINING_MINUTES) {
      console.error(
        `✗ Cached testserver ${config.testserver} expires in ${formatMinutes(left)} (need ${MIN_REMAINING_MINUTES}m); not using it`
      );
    } else {
      usable.push(config);
    }
  }
  // Longest time left first, so a partial reuse picks the freshest.
  usable.sort(
    (a, b) => (remainingMinutes(b) ?? 0) - (remainingMinutes(a) ?? 0)
  );
  return { usable, retained };
}

/**
 * Health-check every sandbox cached at `path` in parallel. Returns the usable
 * ones, the ones to keep cached without using (see triageCachedSandboxes),
 * and the check's ms.
 */
export async function checkCachedSandboxes(path) {
  const cached = readPoolCache(path);
  if (cached.length === 0) return { usable: [], retained: [], checkMs: 0 };
  const startedAt = Date.now();
  const checks = await Promise.all(
    cached.map(async config => ({
      config,
      alive: await isAlive(config.testserver),
    }))
  );
  const checkMs = Date.now() - startedAt;
  return { ...triageCachedSandboxes(checks), checkMs };
}
