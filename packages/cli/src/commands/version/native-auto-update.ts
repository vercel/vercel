import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import semver from 'semver';
import ciInfo from 'ci-info';
import XDGAppPaths from 'xdg-app-paths';
import { readJSONSync } from 'fs-extra';
import type { GlobalConfig } from '@vercel-internals/types';
import type Client from '../../util/client';
import { withDirectoryLock } from '../../util/file-lock';
import {
  getInstallRoot,
  getNativePackageName,
} from '../../util/native-self-update';
import { isNativeBinaryInstall } from '../../util/native-install';
import {
  isNativeUpdateChild,
  spawnNativeUpdateCheck,
  spawnNativeUpdateChild,
} from './native-update-worker';

export const NATIVE_UPDATE_CHECK_INTERVAL = 1000 * 60 * 60 * 24;
export const NATIVE_UPDATE_DISCOVERY_LEASE = 1000 * 60;

/** Installer-managed native updates are default-on unless explicitly disabled. */
export function isNativeAutoUpdateEnabled(config: GlobalConfig): boolean {
  return config.updates?.auto !== false;
}
const CACHE_LOCK_RETRY_MS = 10;
const CACHE_LOCK_ABANDONED_MS = 10_000;

interface NativeUpdateCache {
  discoveryStartedAt?: number;
  expireAt: number;
  selectProduction?: boolean;
  staged?: boolean;
  version?: string;
}

interface NativeUpdateCacheOptions {
  cacheDir?: string;
  executablePath?: string;
  installRoot?: string;
  now?: number;
  selectedProduction?: boolean;
  selectProduction?: boolean;
}

export function getNativeUpdateCacheFile(
  cacheDir = XDGAppPaths('com.vercel.cli').cache()
): string {
  const packageName = getNativePackageName().replaceAll('/', '-');
  return resolve(cacheDir, 'package-updates', `${packageName}-latest.json`);
}

function readNativeUpdateCache(
  cacheDir?: string
): NativeUpdateCache | undefined {
  try {
    const cache = readJSONSync(getNativeUpdateCacheFile(cacheDir));
    if (
      typeof cache?.expireAt === 'number' &&
      (cache.version === undefined ||
        (typeof cache.version === 'string' && semver.valid(cache.version)))
    ) {
      return cache;
    }
  } catch {}
}

async function atomicWriteCache(
  cacheDir: string | undefined,
  cache: NativeUpdateCache
): Promise<void> {
  const cacheFile = getNativeUpdateCacheFile(cacheDir);
  await mkdir(dirname(cacheFile), { recursive: true });
  const temporary = `${cacheFile}.tmp-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(cache)}\n`);
  try {
    await rename(temporary, cacheFile);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function withNativeUpdateCacheLock(
  cacheDir: string | undefined,
  action: () => Promise<void>,
  { waitMs = 5_000 }: { waitMs?: number } = {}
): Promise<void> {
  const lock = `${getNativeUpdateCacheFile(cacheDir)}.lock`;
  await withDirectoryLock(lock, action, {
    waitMs,
    retryMs: CACHE_LOCK_RETRY_MS,
    abandonedAfterMs: CACHE_LOCK_ABANDONED_MS,
    busyMessage: path =>
      `Timed out waiting for the native update cache. If no Vercel update is running, remove the lock at ${path} and retry.`,
  });
}

export async function cacheNativeUpdateVersion(
  version: string,
  {
    cacheDir = XDGAppPaths('com.vercel.cli').cache(),
    now = Date.now(),
    selectProduction = false,
  }: NativeUpdateCacheOptions = {}
): Promise<void> {
  await withNativeUpdateCacheLock(cacheDir, async () => {
    const existing = readNativeUpdateCache(cacheDir);
    const keepNewerExisting = Boolean(
      existing?.version && semver.gt(existing.version, version)
    );
    const nextVersion = keepNewerExisting ? existing?.version : version;
    const shouldSelectProduction =
      selectProduction || existing?.selectProduction === true;
    const staged = shouldSelectProduction
      ? false
      : keepNewerExisting || existing?.version === version
        ? existing?.staged === true
        : false;

    await atomicWriteCache(cacheDir, {
      expireAt: now + NATIVE_UPDATE_CHECK_INTERVAL,
      selectProduction: shouldSelectProduction,
      staged,
      version: nextVersion,
    });
  });
}

export async function cacheNativeUpdateDiscoveryAttempt({
  cacheDir = XDGAppPaths('com.vercel.cli').cache(),
  now = Date.now(),
}: NativeUpdateCacheOptions = {}): Promise<void> {
  await withNativeUpdateCacheLock(cacheDir, async () => {
    const existing = readNativeUpdateCache(cacheDir);
    await atomicWriteCache(cacheDir, {
      ...existing,
      discoveryStartedAt: now,
      expireAt: now + NATIVE_UPDATE_CHECK_INTERVAL,
      staged:
        existing?.selectProduction === true ? existing.staged === true : true,
    });
  });
}

export async function restoreNativeUpdateAfterDiscoveryFailure({
  cacheDir = XDGAppPaths('com.vercel.cli').cache(),
}: NativeUpdateCacheOptions = {}): Promise<void> {
  await withNativeUpdateCacheLock(cacheDir, async () => {
    const cache = readNativeUpdateCache(cacheDir);
    if (cache?.version) {
      await atomicWriteCache(cacheDir, {
        ...cache,
        discoveryStartedAt: undefined,
        staged: false,
      });
    }
  });
}

export async function markNativeUpdateStaged(
  version: string,
  {
    cacheDir = XDGAppPaths('com.vercel.cli').cache(),
    selectedProduction = false,
  }: NativeUpdateCacheOptions = {}
): Promise<void> {
  await withNativeUpdateCacheLock(cacheDir, async () => {
    const cache = readNativeUpdateCache(cacheDir);
    if (
      cache?.version === version &&
      (cache.selectProduction !== true || selectedProduction)
    ) {
      await atomicWriteCache(cacheDir, {
        ...cache,
        discoveryStartedAt: undefined,
        selectProduction: false,
        staged: true,
      });
    }
  });
}

function isWithinInstallRoot(
  executablePath: string,
  installRoot: string
): boolean {
  const pathFromRoot = relative(resolve(installRoot), resolve(executablePath));
  return (
    pathFromRoot !== '' &&
    pathFromRoot !== '..' &&
    !pathFromRoot.startsWith(
      `..${process.platform === 'win32' ? '\\' : '/'}`
    ) &&
    !isAbsolute(pathFromRoot)
  );
}

/**
 * Detach native update work after a successful CLI command. The parent only
 * reads a small local cache and spawns unreferenced children; registry checks,
 * filesystem inspection, locking, and downloads all happen outside it.
 */
export function scheduleNativeAutoUpdate(
  client: Client,
  exitCode: number,
  {
    cacheDir = XDGAppPaths('com.vercel.cli').cache(),
    executablePath = process.execPath,
    installRoot = getInstallRoot(),
    now = Date.now(),
  }: NativeUpdateCacheOptions = {}
): void {
  if (
    exitCode !== 0 ||
    ciInfo.isCI ||
    client.isAgent ||
    client.nonInteractive ||
    isNativeUpdateChild() ||
    !isNativeBinaryInstall() ||
    !isWithinInstallRoot(executablePath, installRoot)
  ) {
    return;
  }

  const cache = readNativeUpdateCache(cacheDir);
  if (
    !isNativeAutoUpdateEnabled(client.config) &&
    cache?.selectProduction !== true
  ) {
    return;
  }

  // Never race a stale retry against fresh discovery: the discovery child owns
  // both cache replacement and staging when metadata is missing or expired.
  if (!cache?.expireAt || cache.expireAt <= now) {
    spawnNativeUpdateCheck();
    return;
  }

  const abandonedDiscovery = Boolean(
    cache.version &&
      cache.staged === true &&
      cache.discoveryStartedAt &&
      cache.discoveryStartedAt + NATIVE_UPDATE_DISCOVERY_LEASE <= now
  );

  // Retry staging on every successful invocation until a child records that it
  // completed. Also recover a known version when discovery is interrupted.
  // A busy installer lock makes the child exit instead of queueing.
  if (cache.version && (cache.staged !== true || abandonedDiscovery)) {
    spawnNativeUpdateChild(cache.version, cache.selectProduction === true);
  }
}
