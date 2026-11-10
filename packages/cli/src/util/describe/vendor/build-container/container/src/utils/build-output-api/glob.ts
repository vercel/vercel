// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { Stats } from 'node:fs';
import { FileFsRef } from '@vercel/build-utils';
import { lstat, readlink, realpath, readdir, stat } from 'node:fs/promises';
import assert from 'assert';
import path from 'path';

export async function glob(options: {
  cwd: string;
  follow?: boolean;
  includeDirectories?: boolean;
}): Promise<Record<string, FileFsRef>> {
  if (!path.isAbsolute(options.cwd)) {
    throw new Error(`basePath/cwd must be an absolute path (${options.cwd})`);
  }

  const results: Record<string, FileFsRef> = {};
  const statCache: Record<string, Stats> = {};
  const symlinks: Record<string, boolean | undefined> = {};
  const files = await walkAll(
    options.cwd,
    Boolean(options.follow),
    statCache,
    symlinks
  );

  const dirs = new Set<string>();
  const dirsWithEntries = new Set<string>();

  for (const relativePath of files) {
    const fsPath = path.join(options.cwd, relativePath);
    let stats = statCache[fsPath];
    assert(stats, `statCache does not contain value for ${relativePath}`);

    const isSymlink = symlinks[fsPath];
    if (
      options.follow &&
      (isSymlink || (await lstat(fsPath)).isSymbolicLink())
    ) {
      const target = await readlink(fsPath);
      const absoluteTarget = path.resolve(path.dirname(fsPath), target);
      if (
        path.relative(options.cwd, absoluteTarget).startsWith(`..${path.sep}`)
      ) {
        continue;
      }
    }

    if (isSymlink || stats.isFile() || stats.isDirectory()) {
      if (isSymlink) {
        stats = await lstat(fsPath);
      }

      const dirname = path.dirname(relativePath);
      dirsWithEntries.add(dirname);
      if (stats.isDirectory()) {
        dirs.add(relativePath);
        continue;
      }

      results[relativePath] = new FileFsRef({
        mode: stats.mode,
        fsPath,
        size: stats.size,
      });
    }
  }

  if (options.includeDirectories) {
    for (const relativePath of dirs) {
      if (dirsWithEntries.has(relativePath)) {
        continue;
      }

      const fsPath = path.join(options.cwd, relativePath);
      const stats = statCache[fsPath];
      results[relativePath] = new FileFsRef({
        mode: stats.mode,
        fsPath,
        size: stats.size,
      });
    }
  }

  return results;
}

/**
 * Recursive readdir walk equivalent to `glob('**', { dot: true, stat:
 * true, follow })`, minus the per-entry minimatch calls and glob's
 * per-candidate allocation churn.
 *
 * Divergences from vanilla glob@7, both deliberate:
 * - Symlink cycles terminate at the first revisit of a directory already
 *   on the current ancestor chain, instead of glob's ELOOP-bounded
 *   duplicate expansion (`loop/back/loop/back/...`). Distinct symlinks
 *   aliasing the same directory (siblings, chains, diamonds) are all
 *   enumerated, matching glob.
 * - Entries whose stat fails (e.g. deleted between readdir and stat) are
 *   dropped, like glob's `statCache[p] = false`, instead of rejecting.
 */
async function walkAll(
  cwd: string,
  follow: boolean,
  statCache: Record<string, Stats>,
  symlinks: Record<string, boolean | undefined>
): Promise<string[]> {
  const files: string[] = [];
  /**
   * @param dirAbs directory to read, possibly through symlink path parts
   * @param realDir canonical (fully resolved) path of `dirAbs`
   * @param ancestors canonical paths of every directory on the current
   *   walk chain, including `dirAbs` itself. Used only for cycle cuts;
   *   per-branch (immutable), so sibling aliases of one target are all
   *   walked and concurrent branches cannot race each other.
   */
  async function walk(
    dirAbs: string,
    realDir: string,
    ancestors: ReadonlySet<string>
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch (err) {
      // Missing / not-a-directory: no matches, same as glob. Anything
      // else (EACCES, EIO, ...) must fail loudly like vanilla glob's
      // default strict mode — swallowing it would silently drop a whole
      // subtree of production static files.
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return;
      throw err;
    }
    await Promise.all(
      entries.map(async entry => {
        const abs = path.join(dirAbs, entry.name);
        if (entry.isSymbolicLink()) {
          if (follow) {
            const stats = await stat(abs).catch(() =>
              lstat(abs).catch(() => null)
            );
            if (stats === null) return; // vanished: glob drops it too
            statCache[abs] = stats;
            files.push(abs);
            if (stats.isDirectory()) {
              const real = await realpath(abs).catch(() => null);
              if (real !== null && !ancestors.has(real)) {
                await walk(abs, real, new Set(ancestors).add(real));
              }
            }
          } else {
            const stats = await lstat(abs).catch(() => null);
            if (stats === null) return;
            statCache[abs] = stats;
            symlinks[abs] = true;
            files.push(abs);
          }
        } else if (entry.isDirectory()) {
          const stats = await lstat(abs).catch(() => null);
          if (stats === null) return;
          statCache[abs] = stats;
          files.push(abs);
          const real = path.join(realDir, entry.name);
          await walk(abs, real, new Set(ancestors).add(real));
        } else {
          const stats = await lstat(abs).catch(() => null);
          if (stats === null) return;
          statCache[abs] = stats;
          files.push(abs);
        }
      })
    );
  }
  const cwdReal = follow ? await realpath(cwd).catch(() => null) : cwd;
  if (cwdReal !== null) {
    await walk(cwd, cwdReal, new Set([cwdReal]));
  }
  return files
    .map(abs => path.relative(cwd, abs))
    .sort((a, b) => a.localeCompare(b, 'en'));
}
