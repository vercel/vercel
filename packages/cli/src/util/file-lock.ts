import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

const DEFAULT_WAIT_MS = 30_000;
const DEFAULT_RETRY_MS = 50;
const RELEASE_OWNER_CHECK_ATTEMPTS = 3;
const RELEASE_OWNER_CHECK_RETRY_MS = 10;

interface LockOwner {
  token: string;
  pid: number;
  createdAt: number;
}

export interface FileLockOptions {
  waitMs?: number;
  retryMs?: number;
  busyMessage: (lockPath: string, timedOut: boolean) => string;
}

interface DirectoryLockOptions extends FileLockOptions {
  abandonedAfterMs?: number;
}

async function readOwnerRaw(lockPath: string): Promise<LockOwner | undefined> {
  const value = JSON.parse(
    await readFile(lockPath, 'utf8')
  ) as Partial<LockOwner>;
  if (
    typeof value.token !== 'string' ||
    value.token.length === 0 ||
    !Number.isSafeInteger(value.pid) ||
    (value.pid ?? 0) <= 0 ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    value.createdAt <= 0
  ) {
    return undefined;
  }
  return value as LockOwner;
}

async function readOwner(lockPath: string): Promise<LockOwner | undefined> {
  try {
    return await readOwnerRaw(lockPath);
  } catch {
    return undefined;
  }
}

/**
 * Decide whether the lock we hold at `ownerPath` is still ours before we
 * release it. A lock we successfully acquired can only stop being "ours"
 * through `moveAbandonedDirectoryLock` stealing it, and that recovery path
 * refuses to run while our own pid is alive (see `processExists` below), so
 * there is no legitimate way for another owner to appear here while we are
 * still running. The only realistic failure mode is a transient read error
 * (for example a Windows file-sharing violation from an antivirus scan or
 * search indexer touching the lock directory). Treat a clean read as
 * authoritative, but do not let a handful of transient errors strand a lock
 * we are exclusively holding: retry briefly, then default to releasing it.
 * Only a definitive "the file is gone" (ENOENT) means there is nothing left
 * for us to release.
 */
async function stillOwnsLock(
  ownerPath: string,
  token: string
): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      const owner = await readOwnerRaw(ownerPath);
      return owner?.token === token;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      if (attempt >= RELEASE_OWNER_CHECK_ATTEMPTS - 1) {
        return true;
      }
      await new Promise(resolve =>
        setTimeout(resolve, RELEASE_OWNER_CHECK_RETRY_MS)
      );
    }
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function moveAbandonedDirectoryLock(
  lockPath: string,
  abandonedAfterMs: number
): Promise<boolean> {
  const owner = await readOwner(`${lockPath}/owner.json`);
  if (
    !owner ||
    Date.now() - owner.createdAt < abandonedAfterMs ||
    processExists(owner.pid)
  ) {
    return false;
  }

  // Every observer of this owner generation chooses the same permanent
  // destination. Once one rename succeeds, delayed observers cannot rename a
  // replacement lock over the non-empty tombstone.
  const generation = createHash('sha256').update(owner.token).digest('hex');
  const tombstone = `${lockPath}.abandoned-${generation}`;
  try {
    await rename(lockPath, tombstone);
    return true;
  } catch (error) {
    if (isContentionError(error, ['ENOENT', 'EEXIST', 'ENOTEMPTY'])) {
      return false;
    }
    throw error;
  }
}

function isContentionError(error: unknown, expectedCodes: string[]): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return Boolean(
    (code && expectedCodes.includes(code)) ||
      (process.platform === 'win32' && code === 'EPERM')
  );
}

async function waitForRetry(
  startedAt: number,
  lockPath: string,
  { waitMs, retryMs, busyMessage }: Required<FileLockOptions>
): Promise<void> {
  if (waitMs === 0 || Date.now() - startedAt >= waitMs) {
    throw new Error(busyMessage(lockPath, waitMs !== 0));
  }
  await new Promise(resolveTimeout =>
    setTimeout(resolveTimeout, Math.min(retryMs, waitMs))
  );
}

/**
 * Acquire a local-filesystem lock without ever removing an existing lock.
 * Abandoned locks require explicit cleanup after callers verify no owner runs.
 */
export async function withFileLock<T>(
  lockPath: string,
  action: () => Promise<T>,
  {
    waitMs = DEFAULT_WAIT_MS,
    retryMs = DEFAULT_RETRY_MS,
    busyMessage,
  }: FileLockOptions
): Promise<T> {
  await mkdir(dirname(lockPath), { recursive: true });
  const owner: LockOwner = {
    token: randomUUID(),
    pid: process.pid,
    createdAt: Date.now(),
  };
  const claim = `${lockPath}.claim-${owner.token}`;
  const released = `${lockPath}.released-${owner.token}`;
  const startedAt = Date.now();
  let acquired = false;

  await writeFile(claim, `${JSON.stringify(owner)}\n`, { flag: 'wx' });
  try {
    for (;;) {
      try {
        await link(claim, lockPath);
        acquired = true;
        break;
      } catch (error) {
        if (!isContentionError(error, ['EEXIST'])) throw error;
        await waitForRetry(startedAt, lockPath, {
          waitMs,
          retryMs,
          busyMessage,
        });
      }
    }
    await rm(claim, { force: true }).catch(() => undefined);

    return await action();
  } finally {
    if (acquired && (await stillOwnsLock(lockPath, owner.token))) {
      if (
        await rename(lockPath, released)
          .then(() => true)
          .catch(() => false)
      ) {
        await rm(released, { force: true });
      } else {
        await rm(lockPath, { force: true });
      }
    }
    await rm(claim, { force: true });
  }
}

/** Preserve the directory lock format used by previously released cache writers. */
export async function withDirectoryLock<T>(
  lockPath: string,
  action: () => Promise<T>,
  {
    waitMs = DEFAULT_WAIT_MS,
    retryMs = DEFAULT_RETRY_MS,
    busyMessage,
    abandonedAfterMs,
  }: DirectoryLockOptions
): Promise<T> {
  await mkdir(dirname(lockPath), { recursive: true });
  const owner: LockOwner = {
    token: randomUUID(),
    pid: process.pid,
    createdAt: Date.now(),
  };
  const claim = `${lockPath}.claim-${owner.token}`;
  const ownerPath = `${claim}/owner.json`;
  const startedAt = Date.now();
  let acquired = false;

  await mkdir(claim);
  await writeFile(ownerPath, `${JSON.stringify(owner)}\n`);
  try {
    for (;;) {
      try {
        await rename(claim, lockPath);
        acquired = true;
        break;
      } catch (error) {
        if (!isContentionError(error, ['EEXIST', 'ENOTEMPTY'])) {
          throw error;
        }
        if (
          abandonedAfterMs !== undefined &&
          (await moveAbandonedDirectoryLock(lockPath, abandonedAfterMs))
        ) {
          continue;
        }
        await waitForRetry(startedAt, lockPath, {
          waitMs,
          retryMs,
          busyMessage,
        });
      }
    }

    return await action();
  } finally {
    if (
      acquired &&
      (await stillOwnsLock(`${lockPath}/owner.json`, owner.token))
    ) {
      // Atomically free the lock slot with a rename before removing our copy,
      // so a concurrent acquirer never renames its claim onto a transiently
      // empty `lockPath` mid-removal (recursive rm is not atomic on POSIX).
      // Fall back to an in-place removal when the rename fails (e.g. Windows
      // EPERM) so the lock is never permanently stranded.
      const released = `${lockPath}.released-${owner.token}`;
      if (
        await rename(lockPath, released)
          .then(() => true)
          .catch(() => false)
      ) {
        await rm(released, { recursive: true, force: true });
      } else {
        await rm(lockPath, { recursive: true, force: true });
      }
    }
    await rm(claim, { recursive: true, force: true });
  }
}
