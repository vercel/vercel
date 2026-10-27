import type { Files, Span } from '@vercel/build-utils';
import { glob } from '@vercel/build-utils';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { availableParallelism, homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { BuildahClient } from '../clients/buildah';
import { BUILDAH_GRAPH_ROOT, buildahStorageArgs } from '../storage-driver';
import {
  debug,
  done,
  elapsed,
  formatBytes,
  info,
  isBuildContainer,
  lstatIfPresent,
  step,
} from '../util';
import { runStoreCommand } from './command';
import type {
  BuildahStorePaths,
  RestoreResult,
  SaveResult,
} from './command/types';
import { buildahStoreCacheEnabled, buildahStoreCacheRequested } from './config';
import { FileLock, buildahStoreLock } from './lock';
import { createBuildahStoreStateDirectory } from './state';

/** Under the repository root, which the platform persists. */
export const BUILDAH_STORE_CACHE_DIR = '.vercel/cache/buildah-store';
const STORE_PATHS: BuildahStorePaths = {
  graphRoot: BUILDAH_GRAPH_ROOT,
  // Buildah's default when running as root, as it does in the build container.
  blobInfoCache: '/var/lib/containers/cache/blob-info-cache-v1.sqlite',
};

/** One snapshot per project: every service shares Buildah's native image store. */
export class BuildahStoreCache {
  static forProject(
    options: { repoRootPath?: string; workPath: string },
    client: BuildahClient
  ): BuildahStoreCache {
    return new BuildahStoreCache(
      resolve(options.repoRootPath || options.workPath),
      client
    );
  }

  constructor(
    private readonly repositoryRoot: string,
    private readonly client: BuildahClient
  ) {}

  /**
   * From `build()`, before a Buildah service opens the store or reads its build
   * context. A service that builds nothing leaves the snapshot for a later
   * deployment.
   */
  async beforeBuild(options: {
    buildsWithBuildah: boolean;
    span?: Span;
  }): Promise<void> {
    if (!isBuildContainer()) {
      return;
    }
    if (buildahStoreCacheEnabled()) {
      if (options.buildsWithBuildah) {
        await this.restore(options.span);
      }
      return;
    }
    if (buildahStoreCacheRequested()) {
      info('Buildah store cache disabled: VERCEL_DEPLOYMENT_ID is not set');
    }
    await this.removeSnapshots();
  }

  /** From `prepareCache`, which the platform runs once every service has built. */
  async afterBuilds(): Promise<Files> {
    if (!isBuildContainer()) {
      return {};
    }
    if (buildahStoreCacheEnabled()) {
      return this.save();
    }
    // Nothing will restore the snapshot, and the platform persists what remains.
    await this.removeSnapshots();
    return {};
  }

  async restore(span?: Span): Promise<void> {
    const start = Date.now();
    step('Restoring the Buildah store cache');
    let result = 'miss';
    let reason: string | undefined;
    let bytes = 0;
    try {
      const archive = await this.archivePath({ create: false });
      const restored = await restoreStore(archive);
      result = restored.status;
      if (restored.status === 'hit') bytes = restored.bytes;
      if (restored.status === 'miss') reason = restored.reason;
    } catch (error) {
      result = 'miss';
      reason = failureReason(error);
    }
    // Build contexts must not include the snapshot, and the save replaces it.
    await this.removeSnapshots();
    const restoredBytes = result === 'hit' ? bytes : 0;
    const detail =
      reason ?? (result === 'hit' ? formatBytes(restoredBytes) : undefined);
    done(
      `Buildah store cache: ${result}${detail ? ` (${detail})` : ''} in ${elapsed(start)}`
    );
    span?.setAttributes({
      'container.buildah_store.restore': result,
      'container.buildah_store.restore_ms': String(Date.now() - start),
      'container.buildah_store.restore_bytes': String(restoredBytes),
      'container.buildah_store.miss_reason': reason,
    });
  }

  async save(): Promise<Files> {
    const start = Date.now();
    step('Saving the Buildah store cache');
    try {
      const archive = await this.archivePath({ create: true });
      const saved = await saveStore(archive);
      done(await describeSave(saved, archive, start));
      if (!(await isRegularFile(archive))) {
        return {};
      }
      return await glob(
        `${BUILDAH_STORE_CACHE_DIR}/${basename(archive)}`,
        this.repositoryRoot
      );
    } catch (error) {
      // Leave the checkout alone: restore already removed any snapshot this
      // deployment read, and one it never read is still valid.
      done(`Buildah store cache not saved (${failureReason(error)})`);
      return {};
    }
  }

  async removeSnapshots(): Promise<void> {
    try {
      await rm(await this.snapshotDirectory({ create: false }), {
        recursive: true,
        force: true,
      });
    } catch (error) {
      debug(
        `could not remove Buildah store snapshots: ${failureReason(error)}`
      );
    }
  }

  private async archivePath(options: { create: boolean }): Promise<string> {
    const key = await snapshotKey(this.client);
    return join(await this.snapshotDirectory(options), `store-${key}.tar.zst`);
  }

  private async snapshotDirectory({
    create,
  }: {
    create: boolean;
  }): Promise<string> {
    const root = await realpath(this.repositoryRoot);
    let directory = root;
    // Each component may come from the checkout, so a link is never followed.
    for (const part of BUILDAH_STORE_CACHE_DIR.split('/')) {
      directory = join(directory, part);
      if (create) {
        await mkdir(directory, { mode: 0o700 }).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        });
      }
      const stats = await lstatIfPresent(directory);
      if (!stats) {
        return join(root, BUILDAH_STORE_CACHE_DIR);
      }
      if (!stats.isDirectory()) {
        throw new Error(`${directory} is not a directory`);
      }
    }
    return directory;
  }
}

/** The restore gate lets only the first service of a deployment extract. */
async function restoreStore(archive: string): Promise<RestoreResult> {
  const storeLock = await requireStoreLock();
  const state = await createBuildahStoreStateDirectory();
  const gate = new FileLock(join(state, 'restore.lock'));
  return runStoreCommand(
    {
      action: 'restore',
      options: {
        ...STORE_PATHS,
        archive,
        storeLock: storeLock.path,
        marker: join(state, 'restored'),
      },
    },
    gate
  );
}

async function saveStore(archive: string): Promise<SaveResult> {
  const buildahArgs = await buildahStorageArgs();
  const storeLock = await requireStoreLock();
  return runStoreCommand(
    {
      action: 'save',
      options: {
        ...STORE_PATHS,
        archive,
        stateDirectory: await createBuildahStoreStateDirectory(),
        threads: availableParallelism(),
        buildahArgs,
      },
    },
    storeLock
  );
}

async function requireStoreLock(): Promise<FileLock> {
  const lock = await buildahStoreLock();
  if (!lock) throw new Error('flock unavailable');
  return lock;
}

async function describeSave(
  result: SaveResult,
  archive: string,
  start: number
): Promise<string> {
  if (result.status === 'saved') {
    return `saved the Buildah store cache (${formatBytes((await lstat(archive)).size)}) in ${elapsed(start)}`;
  }
  if (result.status === 'unused') {
    return (await isRegularFile(archive))
      ? 'kept the previous Buildah store cache: no service built with Buildah'
      : 'no Buildah store cache to keep: no service recorded Buildah image usage';
  }
  if (result.status === 'skipped' && result.previous === 'failed') {
    throw new Error('an earlier save for this deployment failed');
  }
  return 'Buildah store cache already prepared for this deployment';
}

/** A snapshot only restores into the same Buildah, platform and storage setup. */
async function snapshotKey(client: BuildahClient): Promise<string> {
  const configuration = await Promise.all(
    [
      '/usr/share/containers/storage.conf',
      '/etc/containers/storage.conf',
      join(
        process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
        'containers/storage.conf'
      ),
      process.env.CONTAINERS_STORAGE_CONF,
      '/etc/subuid',
      '/etc/subgid',
    ].map(readOptionalFile)
  );
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: await client.version(),
        arch: process.arch,
        uid: process.getuid?.(),
        gid: process.getgid?.(),
        driver: process.env.VERCEL_VCR_DOCKER_STORAGE_DRIVER,
        image: process.env.VERCEL_BUILD_IMAGE,
        configuration,
      })
    )
    .digest('hex')
    .slice(0, 32);
}

async function readOptionalFile(path: string | undefined): Promise<string> {
  if (!path) {
    return '';
  }
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  return (await lstatIfPresent(path))?.isFile() ?? false;
}

function failureReason(error: unknown): string {
  return (
    String((error as Error)?.message ?? error)
      .trim()
      .split('\n')
      .at(-1) ?? ''
  );
}
