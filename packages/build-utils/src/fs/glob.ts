import path from 'path';
import assert from 'assert';
import vanillaGlob_ from 'glob';
import { promisify } from 'util';
import { lstat, readlink, Stats } from 'fs-extra';
import { normalizePath } from './normalize-path';
import FileFsRef from '../file-fs-ref';

export interface GlobOptions extends vanillaGlob_.IOptions {
  includeDirectories?: boolean;
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
    if (
      options.follow &&
      (isSymlink || (await lstat(fsPath)).isSymbolicLink())
    ) {
      const target = await readlink(absPath);
      const absTarget = path.resolve(path.dirname(absPath), target);
      if (path.relative(options.cwd, absTarget).startsWith(`..${path.sep}`)) {
        continue;
      }
    }

    if (isSymlink || stat.isFile() || stat.isDirectory()) {
      if (isSymlink) {
        stat = await lstat(absPath);
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
