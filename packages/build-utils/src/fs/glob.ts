import path from 'path';
import assert from 'assert';
import { promisify } from 'util';
import vanillaGlob_ from 'glob';
import { lstat } from 'fs-extra';
import FileFsRef from '../file-fs-ref';
import { normalizePath } from './normalize-path';
import type { Stats } from 'fs-extra';

export type GlobOptions = vanillaGlob_.IOptions;

const vanillaGlob = promisify(vanillaGlob_);

export default async function glob(
  pattern: string,
  opts: GlobOptions | string,
  mountpoint?: string,
): Promise<Record<string, FileFsRef>> {
  let options: GlobOptions;
  if (typeof opts === 'string') {
    options = { cwd: opts };
  } else {
    options = opts;
  }

  if (!options.cwd) {
    throw new Error(
      'Second argument (basePath) must be specified for names of resulting files',
    );
  }

  if (!path.isAbsolute(options.cwd)) {
    throw new Error(`basePath/cwd must be an absolute path (${options.cwd})`);
  }

  const results: Record<string, FileFsRef> = {};
  const statCache: Record<string, Stats> = {};

  options.symlinks = {};
  options.statCache = statCache;
  options.stat = true;
  options.dot = true;

  const files = await vanillaGlob(pattern, options);

  for (const relativePath of files) {
    const fsPath = normalizePath(path.join(options.cwd, relativePath));
    let stat = statCache[fsPath];
    assert(
      stat,
      `statCache does not contain value for ${relativePath} (resolved to ${fsPath})`,
    );
    const isSymlink = options.symlinks[fsPath];
    if (isSymlink || stat.isFile()) {
      if (isSymlink) {
        stat = await lstat(fsPath);
      }

      let finalPath = relativePath;
      if (mountpoint) {
        finalPath = path.join(mountpoint, finalPath);
      }

      results[finalPath] = new FileFsRef({ mode: stat.mode, fsPath });
    }
  }

  return results;
}
