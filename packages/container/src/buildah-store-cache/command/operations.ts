import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { lstatIfPresent, run } from '../../util';
import { FileLock } from '../lock';
import { CLEANUP_CONTAINER_RE, listStateRecords } from '../state';
import { runStoreCommand } from './index';
import type {
  CleanupOptions,
  ExtractOptions,
  RestoreOptions,
  RestoreResult,
  SaveOptions,
  SaveResult,
} from './types';

const STAGED_BLOB_INFO_CACHE = '.vercel-blob-info-cache.sqlite';
const RETAINED_REPOSITORY = 'localhost/vercel-buildah-store';

/** Callers hold command-lifetime locks: the restore gate, or the store lock. */
export class StoreOperations {
  async restore(options: RestoreOptions): Promise<RestoreResult> {
    if (await lstatIfPresent(options.marker)) {
      await requireRegularFile(options.marker);
      return { status: 'skipped' };
    }
    await mkdir(dirname(options.marker), { recursive: true });
    await writeFile(options.marker, '', { flag: 'wx', mode: 0o600 });
    if (!(await lstatIfPresent(options.archive))) {
      return { status: 'miss', reason: 'no_compatible_snapshot' };
    }
    // Late services must not wait behind a sibling build's shared store lock.
    return runStoreCommand(
      {
        action: 'extract',
        options: {
          graphRoot: options.graphRoot,
          archive: options.archive,
          blobInfoCache: options.blobInfoCache,
        },
      },
      new FileLock(options.storeLock)
    );
  }

  async extract(options: ExtractOptions): Promise<RestoreResult> {
    const store = await lstatIfPresent(options.graphRoot);
    if (store) {
      await requireDirectory(options.graphRoot);
      if ((await readdir(options.graphRoot)).length > 0) {
        return { status: 'warm' };
      }
    }
    const archive = await requireRegularFile(options.archive);
    await mkdir(dirname(options.graphRoot), { recursive: true });
    const staging = await mkdtemp(`${options.graphRoot}.restore.`);
    try {
      await run(
        'tar',
        [
          '--extract',
          '--zstd',
          `--file=${options.archive}`,
          `--directory=${staging}`,
          '--numeric-owner',
          '--same-owner',
          '--same-permissions',
          '--xattrs',
          '--xattrs-include=*',
        ],
        { quiet: true }
      );
      if (store) await rmdir(options.graphRoot);
      await run('mv', ['-T', '--', staging, options.graphRoot], {
        quiet: true,
      });
      await this.restoreBlobInfoCache(
        join(options.graphRoot, STAGED_BLOB_INFO_CACHE),
        options.blobInfoCache
      );
      return { status: 'hit', bytes: archive.size };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  async save(options: SaveOptions): Promise<SaveResult> {
    const result = join(options.stateDirectory, 'save-result');
    if (await lstatIfPresent(result)) {
      await requireRegularFile(result);
      const previous =
        (await readFile(result, 'utf8')).replace(/\n+$/, '') || 'failed';
      if (
        previous === 'saved' ||
        previous === 'unused' ||
        previous === 'failed'
      ) {
        return { status: 'skipped', previous };
      }
      throw new Error('invalid Buildah store save result');
    }
    await mkdir(options.stateDirectory, { recursive: true });
    await writeFile(result, '', { flag: 'wx', mode: 0o600 });
    const records = await listStateRecords(options.stateDirectory, '.images');
    if (records.length === 0) {
      await writeFile(result, 'unused\n');
      return { status: 'unused' };
    }
    await this.finishPendingCleanup(options);
    await requireDirectory(options.graphRoot);
    await this.pruneImages(records, options.buildahArgs);
    await this.stageBlobInfoCache(
      options.blobInfoCache,
      join(options.graphRoot, STAGED_BLOB_INFO_CACHE)
    );
    await this.archiveStore(options);
    await writeFile(result, 'saved\n');
    return { status: 'saved' };
  }

  async cleanup(options: CleanupOptions): Promise<void> {
    if (!(await lstatIfPresent(options.record))) return;
    await requireRegularFile(options.record);
    await run('buildah', options.buildahArgs, { quiet: true });
    await unlink(options.record);
  }

  private async finishPendingCleanup(options: SaveOptions): Promise<void> {
    for (const record of await listStateRecords(
      options.stateDirectory,
      '.cleanup'
    )) {
      await requireRegularFile(record);
      const container = (await readFile(record, 'utf8')).replace(/\n+$/, '');
      if (!CLEANUP_CONTAINER_RE.test(container)) {
        throw new Error('invalid Buildah cleanup record');
      }
      await run('buildah', [...options.buildahArgs, 'rm', container], {
        quiet: true,
      });
      await unlink(record);
    }
  }

  private async pruneImages(records: string[], buildahArgs: string[]) {
    const containers = await run(
      'buildah',
      [...buildahArgs, 'containers', '--quiet'],
      {
        quiet: true,
      }
    );
    if (containers.stdout.replace(/\n+$/, '') !== '') {
      throw new Error('Buildah containers are still active');
    }
    const listing = await run(
      'buildah',
      [...buildahArgs, 'images', '--all', '--no-trunc', '--json'],
      { quiet: true }
    );
    const images = JSON.parse(listing.stdout) as {
      id: string;
      names: string[] | null;
    }[];
    const names = new Map<string, string[]>();
    for (const image of images) {
      const id = image.id.replace(/^sha256:/, '');
      if (!/^[a-f0-9]{64}$/.test(id)) {
        throw new Error(`invalid Buildah image ID: ${id}`);
      }
      names.set(id, image.names ?? []);
    }
    const keep = new Set<string>();
    for (const record of records) {
      await requireRegularFile(record);
      const references = (await readFile(record, 'utf8')).split('\n');
      if (references.at(-1) === '') references.pop();
      if (references.length === 0) {
        throw new Error('Buildah image usage is incomplete');
      }
      for (const line of references) {
        const reference = line.trim();
        if (!/^[a-f0-9]{12,64}$/.test(reference)) {
          throw new Error('Buildah image usage is incomplete');
        }
        for (const id of names.keys()) {
          if (id.startsWith(reference)) keep.add(id);
        }
      }
    }
    if (keep.size === 0) throw new Error('no Buildah images retained');
    const untag: string[] = [];
    const obsolete: string[] = [];
    // Tags protect retained parents from rmi's recursive dangling-image removal.
    for (const [id, references] of names) {
      if (keep.has(id)) {
        const tag = `${RETAINED_REPOSITORY}:${id}`;
        await run('buildah', [...buildahArgs, 'tag', id, tag], { quiet: true });
        for (const name of references) {
          // Digest names can't go stale, and libimage may stop untagging them.
          if (!name.includes('@') && name !== tag) untag.push(name);
        }
      } else {
        obsolete.push(id);
      }
    }
    if (untag.length > 0) {
      await run('buildah', [...buildahArgs, 'rmi', ...untag], { quiet: true });
    }
    if (obsolete.length > 0) {
      await run('buildah', [...buildahArgs, 'rmi', '--force', ...obsolete], {
        quiet: true,
      });
    }
  }

  private async archiveStore(options: SaveOptions): Promise<void> {
    const temporary = `${options.archive}.${randomUUID()}`;
    await writeFile(temporary, '', { flag: 'wx', mode: 0o600 });
    try {
      await run(
        'tar',
        [
          '--create',
          `--use-compress-program=zstd -q -1 -T${options.threads}`,
          `--file=${temporary}`,
          `--directory=${options.graphRoot}`,
          '--one-file-system',
          '--sparse',
          '--numeric-owner',
          '--xattrs',
          '--xattrs-include=*',
          '--anchored',
          '--no-wildcards-match-slash',
          '--exclude=./overlay/*/merged',
          '--exclude=./overlay/*/work/*',
          '.',
        ],
        { quiet: true }
      );
      await run('mv', ['-fT', '--', temporary, options.archive], {
        quiet: true,
      });
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async restoreBlobInfoCache(
    staged: string,
    destination: string
  ): Promise<void> {
    try {
      if (!(await lstatIfPresent(staged))?.isFile()) return;
      if (await lstatIfPresent(destination)) return;
    } catch {
      return;
    }
    try {
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(staged, destination, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        await rm(destination, { force: true }).catch(() => {});
      }
    }
  }

  private async stageBlobInfoCache(
    source: string,
    staged: string
  ): Promise<void> {
    try {
      await rm(staged, { force: true });
    } catch {
      return;
    }
    try {
      if (!(await lstatIfPresent(source))?.isFile()) return;
      if (await stat(`${source}-journal`).catch(() => undefined)) return;
      await copyFile(source, staged);
    } catch {
      await rm(staged, { force: true }).catch(() => {});
    }
  }
}

async function requireRegularFile(path: string): Promise<Stats> {
  const stats = await lstatIfPresent(path);
  if (stats?.isSymbolicLink()) {
    throw new Error(`file must not be a symlink: ${path}`);
  }
  if (!stats?.isFile()) throw new Error(`expected a regular file: ${path}`);
  return stats;
}

async function requireDirectory(path: string): Promise<void> {
  const stats = await lstatIfPresent(path);
  if (stats?.isSymbolicLink()) {
    throw new Error(`directory must not be a symlink: ${path}`);
  }
  if (!stats?.isDirectory()) throw new Error(`expected a directory: ${path}`);
}
