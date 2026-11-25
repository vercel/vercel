import path from 'path';
import assert from 'assert';
import vanillaGlob_ from 'glob';
import { promisify } from 'util';
import { lstat, readlink } from 'fs/promises';
import type { Stats } from 'fs';
import { normalizePath } from './normalize-path';
import FileFsRef from '../file-fs-ref';

export interface GlobOptions {
  cwd?: string;
  dot?: boolean;
  follow?: boolean;
  ignore?: string | ReadonlyArray<string>;
  includeDirectories?: boolean;
  nodir?: boolean;
}

const vanillaGlob = promisify(vanillaGlob_);

export default async function glob(
  pattern: string,
  opts: GlobOptions | string,
  mountpoint?: string
): Promise<Record<string, FileFsRef>> {
  const options = typeof opts === 'string' ? { cwd: opts } : opts;

  if (!options.cwd) {
    throw new Error(
      'Second argument (basePath) must be specified for names of resulting files'
    );
  }

  if (!path.isAbsolute(options.cwd)) {
    throw new Error(`basePath/cwd must be an absolute path (${options.cwd})`);
  }

  const results: Record<string, FileFsRef> = {};
  const statCache: Record<string, Stats> = {};
  const symlinks: Record<string, boolean | undefined> = {};

  const files = await vanillaGlob(pattern, {
    ...options,
    symlinks,
    statCache,
    stat: true,
    dot: true,
  });

  const dirs = new Set<string>();
  const dirsWithEntries = new Set<string>();

  for (const relativePath of files) {
    const absPath = path.join(options.cwd, relativePath);
    const fsPath = normalizePath(absPath);

    let stat = statCache[fsPath];
    assert(
      stat,
      `statCache does not contain value for ${relativePath} (resolved to ${fsPath})`
    );

    const isSymlink = symlinks[fsPath];

    // When `follow` mode is enabled, ensure that the entry is not a symlink
    // that points to outside of `cwd`
    let symlinkStat: Stats | undefined;
    if (options.follow) {
      if (isSymlink) {
        symlinkStat = await lstat(fsPath);
      } else {
        const lstats = await lstat(fsPath);
        if (lstats.isSymbolicLink()) {
          symlinkStat = lstats;
        }
      }

      if (symlinkStat) {
        const target = await readlink(absPath);
        const absTarget = path.resolve(path.dirname(absPath), target);
        if (path.relative(options.cwd, absTarget).startsWith(`..${path.sep}`)) {
          continue;
        }
      }
    }

    if (isSymlink || stat.isFile() || stat.isDirectory()) {
      if (isSymlink) {
        // Reuse symlinkStat from above if available (when follow=true),
        // otherwise call lstat (when follow=false)
        stat = symlinkStat ?? (await lstat(fsPath));
      }

      // Some bookkeeping to track which directories already have entries within
      const dirname = path.dirname(relativePath);
      dirsWithEntries.add(dirname);
      if (stat.isDirectory()) {
        dirs.add(relativePath);
        continue;
      }

      let finalPath = relativePath;
      if (mountpoint) {
        finalPath = path.join(mountpoint, finalPath);
      }

      results[finalPath] = new FileFsRef({ mode: stat.mode, fsPath });
    }
  }

  // Add empty directory entries
  if (options.includeDirectories) {
    for (const relativePath of dirs) {
      if (dirsWithEntries.has(relativePath)) continue;

      let finalPath = relativePath;
      if (mountpoint) {
        finalPath = path.join(mountpoint, finalPath);
      }

      const fsPath = normalizePath(path.join(options.cwd, relativePath));
      const stat = statCache[fsPath];

      results[finalPath] = new FileFsRef({ mode: stat.mode, fsPath });
    }
  }

  return results;
}
