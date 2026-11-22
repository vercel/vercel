import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildahCommandLock } from '../clients/buildah';
import { hasCommand } from '../util';
import { buildahStoreCacheEnabled } from './config';

/** A flock(1) lock file. A wrapped command holds the lock while it runs. */
export class FileLock {
  constructor(readonly path: string) {}

  shared(command: string[]): string[] {
    return this.wrap('--shared', command);
  }

  exclusive(command: string[]): string[] {
    return this.wrap('--exclusive', command);
  }

  private wrap(mode: string, command: string[]): string[] {
    // --close stops processes the command leaves running from holding the lock.
    return ['flock', mode, '--close', this.path, ...command];
  }
}

let flockAvailable: Promise<boolean> | undefined;

/**
 * Buildah commands take the shared side, including in other services' builder
 * processes. Restoring or saving the store takes the exclusive side.
 */
export async function buildahStoreLock(): Promise<FileLock | undefined> {
  if (!buildahStoreCacheEnabled()) {
    return undefined;
  }
  flockAvailable ??= hasCommand('flock');
  return (await flockAvailable)
    ? new FileLock(join(tmpdir(), 'vercel-buildah-store.lock'))
    : undefined;
}

export const sharedBuildahStoreLock: BuildahCommandLock = {
  async wrap(command) {
    const lock = await buildahStoreLock();
    return lock ? lock.shared(command) : command;
  },
};

/** Test-only: forget whether flock is available. */
export function __resetFlockAvailability(): void {
  flockAvailable = undefined;
}
