import { randomUUID } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import {
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { withFileLock } from './file-lock';

export type NativeTrack = 'production' | 'pr';
export type NativeSlot = 'a' | 'b';

export interface SlotMetadata {
  track: NativeTrack;
  slot: NativeSlot;
  version: string;
  pr?: number;
  buildSha?: string;
}

export interface NativeInstallState {
  track: NativeTrack;
  slot: NativeSlot;
  version: string;
  pr?: number;
  buildSha?: string;
  pendingProduction?: {
    slot: NativeSlot;
    version: string;
  };
}

const SLOTS: readonly NativeSlot[] = ['a', 'b'];
const LOCK_RETRY_MS = 50;

function tracksDir(root: string): string {
  // Keep managed slots below `versions` so released native CLIs still recognize
  // the executable as curl-installed after a production switch.
  return join(root, 'versions', 'tracks');
}

function slotDir(root: string, track: NativeTrack, slot: NativeSlot): string {
  return join(tracksDir(root), track, slot);
}

function isTrack(value: string): value is NativeTrack {
  return value === 'production' || value === 'pr';
}

function isSlot(value: string): value is NativeSlot {
  return value === 'a' || value === 'b';
}

async function atomicSymlink(target: string, path: string): Promise<void> {
  const temporary = `${path}.tmp-${randomUUID()}`;
  await symlink(target, temporary);
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = `${path}.tmp-${randomUUID()}`;
  await writeFile(temporary, contents);
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function readSlotMetadata(
  root: string,
  track: NativeTrack,
  slot: NativeSlot
): Promise<SlotMetadata | undefined> {
  try {
    const value = JSON.parse(
      await readFile(join(slotDir(root, track, slot), 'metadata.json'), 'utf8')
    ) as Partial<SlotMetadata>;
    if (
      value.track !== track ||
      value.slot !== slot ||
      typeof value.version !== 'string'
    ) {
      return undefined;
    }
    return value as SlotMetadata;
  } catch {
    return undefined;
  }
}

async function readPointer(
  root: string,
  path: string
): Promise<{ track: NativeTrack; slot: NativeSlot } | undefined> {
  try {
    const target = resolve(root, await readlink(path));
    const rel = relative(tracksDir(root), target).split(sep);
    if (rel.length !== 2 || !isTrack(rel[0]) || !isSlot(rel[1])) {
      return undefined;
    }
    return { track: rel[0], slot: rel[1] };
  } catch {
    return undefined;
  }
}

export async function readActivePointer(
  root: string
): Promise<{ track: NativeTrack; slot: NativeSlot } | undefined> {
  return readPointer(root, join(root, 'active'));
}

async function readTrackPointer(
  root: string,
  track: NativeTrack
): Promise<NativeSlot | undefined> {
  try {
    const target = await readlink(join(tracksDir(root), track, 'active'));
    const slot = target.split(sep).pop();
    return slot && isSlot(slot) ? slot : undefined;
  } catch {
    return undefined;
  }
}

export async function readNativeInstallState(
  root: string
): Promise<NativeInstallState | undefined> {
  const pointer = await readActivePointer(root);
  if (!pointer) return undefined;

  const active = await readSlotMetadata(root, pointer.track, pointer.slot);
  if (!active) return undefined;

  let pendingProduction: NativeInstallState['pendingProduction'];
  try {
    const pending = JSON.parse(
      await readFile(join(root, 'pending-production.json'), 'utf8')
    ) as { slot?: string; version?: string };
    if (pending.slot && isSlot(pending.slot) && pending.version) {
      const metadata = await readSlotMetadata(root, 'production', pending.slot);
      if (
        metadata?.version === pending.version &&
        !(pointer.track === 'production' && pointer.slot === pending.slot)
      ) {
        pendingProduction = {
          slot: pending.slot,
          version: pending.version,
        };
      }
    }
  } catch {}

  return { ...active, pendingProduction };
}

export async function ensureNativeBinLinks(root: string): Promise<void> {
  const bin = join(root, 'bin');
  await mkdir(bin, { recursive: true });
  for (const name of ['vercel', 'vc']) {
    const path = join(bin, name);
    const expected = join('..', 'active', 'vercel');
    const current = await readlink(path).catch(() => undefined);
    if (current !== expected) {
      await atomicSymlink(expected, path);
    }
  }
}

export async function markPendingProduction(
  root: string,
  slot: NativeSlot,
  version: string
): Promise<void> {
  await atomicWrite(
    join(root, 'pending-production.json'),
    `${JSON.stringify({ slot, version })}\n`
  );
}

export async function activateSlot(
  root: string,
  track: NativeTrack,
  slot: NativeSlot
): Promise<void> {
  const metadata = await readSlotMetadata(root, track, slot);
  const binary = await stat(join(slotDir(root, track, slot), 'vercel')).catch(
    () => undefined
  );
  if (!metadata || !binary?.isFile()) {
    throw new Error(`Cannot activate incomplete ${track}/${slot} slot`);
  }

  const trackDir = join(tracksDir(root), track);
  await mkdir(trackDir, { recursive: true });
  await atomicSymlink(slot, join(trackDir, 'active'));
  await atomicSymlink(
    relative(root, slotDir(root, track, slot)),
    join(root, 'active')
  );
  if (track === 'production') {
    await rm(join(root, 'pending-production.json'), { force: true });
  }
  await ensureNativeBinLinks(root);
}

export async function getInactiveSlot(
  root: string,
  track: NativeTrack
): Promise<NativeSlot> {
  const active = await readActivePointer(root);
  const selected =
    active?.track === track ? active.slot : await readTrackPointer(root, track);
  return selected === 'a' ? 'b' : 'a';
}

/**
 * Replace one inactive slot with a fully prepared temporary directory. The
 * callback must put an executable named `vercel` in the supplied directory.
 */
export async function writeTrackSlot(
  root: string,
  metadata: Omit<SlotMetadata, 'slot'>,
  prepare: (directory: string) => Promise<void>,
  { signal }: { signal?: AbortSignal } = {}
): Promise<NativeSlot> {
  signal?.throwIfAborted();
  const slot = await getInactiveSlot(root, metadata.track);
  const trackDir = join(tracksDir(root), metadata.track);
  const destination = slotDir(root, metadata.track, slot);
  const temporary = join(trackDir, `.slot-${slot}-${randomUUID()}`);
  const backup = join(trackDir, `.old-${slot}-${randomUUID()}`);
  signal?.throwIfAborted();
  await mkdir(temporary, { recursive: true });

  try {
    signal?.throwIfAborted();
    await prepare(temporary);
    signal?.throwIfAborted();
    const binary = await stat(join(temporary, 'vercel')).catch(() => undefined);
    if (!binary?.isFile()) {
      throw new Error('Prepared slot does not contain a Vercel CLI binary');
    }
    signal?.throwIfAborted();
    await atomicWrite(
      join(temporary, 'metadata.json'),
      `${JSON.stringify({ ...metadata, slot })}\n`
    );
    signal?.throwIfAborted();

    let hadDestination = false;
    try {
      await rename(destination, backup);
      hadDestination = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    try {
      signal?.throwIfAborted();
      await rename(temporary, destination);
    } catch (error) {
      if (hadDestination) await rename(backup, destination).catch(() => {});
      throw error;
    }
    if (hadDestination) await rm(backup, { recursive: true, force: true });
    return slot;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function withNativeInstallLock<T>(
  root: string,
  action: () => Promise<T>,
  { wait = true, waitMs = 30_000 }: { wait?: boolean; waitMs?: number } = {}
): Promise<T> {
  const lock = join(root, 'update.lock');
  return withFileLock(lock, action, {
    waitMs: wait ? waitMs : 0,
    retryMs: LOCK_RETRY_MS,
    busyMessage: (path, timedOut) =>
      timedOut
        ? `Timed out waiting for another Vercel CLI update. If no update is running, remove the lock at ${path} and retry.`
        : 'Native update already in progress',
  });
}

export async function listNativeTrackSlots(
  root: string
): Promise<SlotMetadata[]> {
  const installed: SlotMetadata[] = [];
  for (const track of ['production', 'pr'] as const) {
    for (const slot of SLOTS) {
      const metadata = await readSlotMetadata(root, track, slot);
      const binary = await stat(
        join(slotDir(root, track, slot), 'vercel')
      ).catch(() => undefined);
      if (metadata && binary?.isFile()) installed.push(metadata);
    }
  }
  return installed;
}

export const NATIVE_SLOTS = SLOTS;
