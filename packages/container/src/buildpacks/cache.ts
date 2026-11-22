import type { Span } from '@vercel/build-utils';
import { createHash } from 'node:crypto';
import {
  constants,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { formatBytes } from '../util';

/** Under the repository root, which the platform persists. */
export const BUILDPACK_CACHE_DIR = '.vercel/cache/buildpacks';

/** The lifecycle's committed cache: its metadata plus one tar per layer. */
export const CNB_COMMITTED_DIR = 'committed';
export const CNB_CACHE_METADATA_FILE = 'io.buildpacks.lifecycle.cache.metadata';

/**
 * The cache key of what the cache was built on; it is only reused there. The
 * file keeps its original name so existing caches stay valid.
 */
export const IMAGE_ID_FILE = 'image-id';

export type BuildpackCacheRestore =
  | { status: 'hit'; bytes: number }
  | { status: 'miss'; reason: string };

export type BuildpackCacheSave =
  | { status: 'saved'; bytes: number }
  | { status: 'unchanged' }
  | { status: 'skipped'; reason: string };

/**
 * One directory per application; the platform caches per project. Daemons
 * that share a root build different executables, so each gets its own.
 */
export function buildpackCacheDir(options: {
  repoRootPath?: string;
  workPath: string;
  service?: { name?: string };
  config?: { daemon?: { name: string } };
}): string {
  const root = resolve(options.repoRootPath || options.workPath);
  const app =
    relative(root, resolve(options.workPath)).split(sep).join('/') || '.';
  const daemon = options.config?.daemon;
  const owner = daemon
    ? { daemon: daemon.name }
    : (options.service?.name ?? null);
  const key = createHash('sha256')
    .update(JSON.stringify([app, owner]))
    .digest('hex')
    .slice(0, 32);
  return join(root, BUILDPACK_CACHE_DIR, key);
}

/**
 * Copy the saved cache into the lifecycle's private `-cache-dir` before the
 * cache key is known, so the copy can overlap the build environment setup. It
 * is not mounted directly: the lifecycle renames `committed/`, which the
 * overlay checkout can refuse.
 */
export async function restoreBuildpackCache(
  dir: string,
  cacheKey: string | Promise<string>,
  cacheDir: string
): Promise<BuildpackCacheRestore> {
  const committed = join(cacheDir, CNB_COMMITTED_DIR);
  // Finish copying before cleanup, even if the cache key lookup fails first.
  const [copy, key] = await Promise.allSettled([
    copyCommitted(dir, cacheDir),
    cacheKey,
  ]);
  try {
    if (copy.status === 'rejected') throw copy.reason;
    if (key.status === 'rejected') throw key.reason;
    if (readRegularFile(join(dir, IMAGE_ID_FILE)) !== key.value) {
      rmSync(committed, { recursive: true, force: true });
      return { status: 'miss', reason: 'base_image_changed' };
    }
    return { status: 'hit', bytes: sizeOf(committed) };
  } catch (error) {
    rmSync(committed, { recursive: true, force: true });
    const cold = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      status: 'miss',
      reason: cold ? 'no_cache' : firstLine(error),
    };
  }
}

export async function saveBuildpackCache(
  dir: string,
  cacheKey: string,
  cacheDir: string
): Promise<BuildpackCacheSave> {
  const committed = join(cacheDir, CNB_COMMITTED_DIR);
  let metadata: string;
  try {
    assertDirectory(committed);
    metadata = readRegularFile(join(committed, CNB_CACHE_METADATA_FILE));
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      status: 'skipped',
      reason: missing ? 'no_cache_written' : firstLine(error),
    };
  }
  try {
    if (isSaved(dir, cacheKey, metadata)) return { status: 'unchanged' };
    const bytes = sizeOf(committed);
    rmSync(dir, { recursive: true, force: true });
    await copyCommitted(cacheDir, dir);
    writeFileSync(join(dir, IMAGE_ID_FILE), cacheKey);
    return { status: 'saved', bytes };
  } catch (error) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Cleanup must not turn a skipped cache save into a failed build.
    }
    return { status: 'skipped', reason: firstLine(error) };
  }
}

/** Layer tars are named by digest, so equal metadata means equal contents. */
function isSaved(dir: string, cacheKey: string, metadata: string): boolean {
  try {
    const committed = join(dir, CNB_COMMITTED_DIR);
    assertDirectory(committed);
    return (
      readRegularFile(join(dir, IMAGE_ID_FILE)) === cacheKey &&
      readRegularFile(join(committed, CNB_CACHE_METADATA_FILE)) === metadata
    );
  } catch {
    return false;
  }
}

/**
 * Copy `committed/`, which the lifecycle fills with regular files only. The
 * build can write the scratch side and the checkout can populate
 * `.vercel/cache`, so a link or special file on either side is refused
 * rather than followed on the host. Files are cloned where the filesystem
 * supports it and copied otherwise.
 */
async function copyCommitted(from: string, to: string): Promise<void> {
  const source = join(from, CNB_COMMITTED_DIR);
  const target = join(to, CNB_COMMITTED_DIR);
  assertDirectory(source);
  mkdirSync(target, { recursive: true });
  const entries = readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) throw notRegularFile(entry.name);
  }
  const copies = await Promise.allSettled(
    entries.map(entry =>
      copyFile(
        join(source, entry.name),
        join(target, entry.name),
        constants.COPYFILE_FICLONE
      )
    )
  );
  const failed = copies.find(copy => copy.status === 'rejected');
  if (failed) throw failed.reason;
}

function assertDirectory(path: string): void {
  if (!lstatSync(path).isDirectory()) {
    throw new Error(`${basename(path)} is not a directory`);
  }
}

/** Read a cache file without following a link or opening a special file. */
function readRegularFile(path: string): string {
  if (!lstatSync(path).isFile()) throw notRegularFile(basename(path));
  return readFileSync(path, 'utf8');
}

function notRegularFile(name: string): Error {
  return new Error(`${JSON.stringify(name)} is not a regular file`);
}

function sizeOf(dir: string): number {
  return readdirSync(dir).reduce(
    (bytes, name) => bytes + lstatSync(join(dir, name)).size,
    0
  );
}

function firstLine(error: unknown): string {
  return (error as Error).message.split('\n')[0];
}

export function describeRestore(outcome: BuildpackCacheRestore): string {
  return outcome.status === 'hit'
    ? `restored buildpack cache (${formatBytes(outcome.bytes)})`
    : `no buildpack cache to restore (${outcome.reason})`;
}

export function describeSave(outcome: BuildpackCacheSave): string {
  switch (outcome.status) {
    case 'saved':
      return `saved buildpack cache (${formatBytes(outcome.bytes)})`;
    case 'unchanged':
      return 'buildpack cache unchanged';
    default:
      return `buildpack cache not saved (${outcome.reason})`;
  }
}

export function recordRestore(
  span: Span | undefined,
  outcome: BuildpackCacheRestore,
  durationMs: number
): void {
  span?.setAttributes({
    'buildpack.cache.restore': outcome.status,
    'buildpack.cache.restore_ms': String(durationMs),
    ...(outcome.status === 'hit'
      ? { 'buildpack.cache.restore_bytes': String(outcome.bytes) }
      : { 'buildpack.cache.miss_reason': outcome.reason }),
  });
}

export function recordSave(
  span: Span | undefined,
  outcome: BuildpackCacheSave,
  durationMs: number
): void {
  span?.setAttributes({
    'buildpack.cache.save': outcome.status,
    'buildpack.cache.save_ms': String(durationMs),
    ...(outcome.status === 'saved'
      ? { 'buildpack.cache.save_bytes': String(outcome.bytes) }
      : {}),
    ...(outcome.status === 'skipped'
      ? { 'buildpack.cache.skip_reason': outcome.reason }
      : {}),
  });
}
