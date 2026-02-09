import { join } from 'path';
import { open, unlink, readFile } from 'fs/promises';
import { unlinkSync, constants } from 'fs';
import { VERCEL_DIR } from '../projects/link';
import output from '../../output-manager';

const DEV_LOCK_FILE = 'dev.lock';

export interface DevLockFile {
  pid: number;
  port: number;
  startedAt: number;
  cwd: string;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function tryCreateLockFile(
  lockPath: string,
  content: string
): Promise<boolean> {
  try {
    const fd = await open(
      lockPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
    );
    await fd.writeFile(content, 'utf8');
    await fd.close();
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }
    throw err;
  }
}

async function tryReadLockFile(lockPath: string): Promise<DevLockFile | null> {
  try {
    const content = await readFile(lockPath, 'utf8');
    return JSON.parse(content) as DevLockFile;
  } catch {
    return null;
  }
}

export type DevLockResult =
  | { acquired: true }
  | { acquired: false; existingLock: DevLockFile }
  | { acquired: false; existingLock: null; reason: string };

export async function acquireDevLock(
  projectRoot: string,
  port: number
): Promise<DevLockResult> {
  const lockPath = join(projectRoot, VERCEL_DIR, DEV_LOCK_FILE);

  const lockData: DevLockFile = {
    pid: process.pid,
    port,
    startedAt: Date.now(),
    cwd: projectRoot,
  };
  const lockContent = JSON.stringify(lockData);

  try {
    if (await tryCreateLockFile(lockPath, lockContent)) {
      return { acquired: true };
    }
  } catch (err) {
    output.debug(`Failed to create lock file: ${err}`);
  }

  // Lock file exists - check if it's stale or held by another process
  const existingLock = await tryReadLockFile(lockPath);

  if (existingLock) {
    if (isProcessRunning(existingLock.pid)) {
      return { acquired: false, existingLock };
    }

    output.debug(`Removing stale lock from PID ${existingLock.pid}`);
    try {
      await unlink(lockPath);
    } catch (err) {
      output.debug(`Failed to remove stale lock file: ${err}`);
    }

    try {
      if (await tryCreateLockFile(lockPath, lockContent)) {
        return { acquired: true };
      }
    } catch (err) {
      output.debug(`Failed to create lock after removing stale: ${err}`);
    }

    // Another process grabbed the lock, show who's the owner
    const newLock = await tryReadLockFile(lockPath);
    if (newLock) {
      return { acquired: false, existingLock: newLock };
    }
  } else {
    output.debug('Lock file exists but cannot be read');
  }

  // Failed to acquire and couldn't read the lock owner
  return {
    acquired: false,
    existingLock: null,
    reason: `Lock file exists at ${lockPath} but cannot be read`,
  };
}

export function releaseDevLock(projectRoot: string): void {
  const lockPath = join(projectRoot, VERCEL_DIR, DEV_LOCK_FILE);
  try {
    unlinkSync(lockPath);
  } catch (err) {
    output.debug(`Failed to release lock: ${err}`);
  }
}
