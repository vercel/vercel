import type { Dirent, Stats } from 'fs';
import { DetectorFilesystem } from '../detectors/filesystem';

function removeWindowsPrefix(path: string) {
  // on windows, this will return a path like
  // D:/c/package.json
  // since we abstract the filesystem, we need to remove windows specific info from the path
  // and let the FS decide how to process the path
  // D:/c/package.json => /c/package.json
  return path.replace(/^[a-zA-Z]:/, '');
}

/**
 * Subset of FSOption from path-scurry used by glob.
 * Defined inline to avoid depending on path-scurry directly.
 */
interface GlobFs {
  readdir: (
    path: string,
    options: { withFileTypes: true },
    cb: (er: NodeJS.ErrnoException | null, entries?: Dirent[]) => void
  ) => void;
  lstatSync: (path: string) => Stats;
  promises: {
    lstat: (path: string) => Promise<Stats>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

function makeStats(isPathAFile: boolean): Stats {
  return {
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: 0,
    blksize: 0,
    blocks: 0,
    atimeMs: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    birthtimeMs: 0,
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
    dev: 0,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isDirectory: () => !isPathAFile,
    isFIFO: () => false,
    isFile: () => isPathAFile,
    isSocket: () => false,
    isSymbolicLink: () => false,
  };
}

export function getGlobFs(_fs: DetectorFilesystem): GlobFs {
  return {
    readdir(
      path: string,
      _options: { withFileTypes: true },
      cb: (er: NodeJS.ErrnoException | null, entries?: Dirent[]) => void
    ): void {
      _fs
        .readdir(removeWindowsPrefix(path))
        .then(stats => {
          const dirents = stats.map(stat => {
            return {
              name: stat.name,
              isFile: () => stat.type === 'file',
              isDirectory: () => stat.type === 'dir',
              isBlockDevice: () => false,
              isCharacterDevice: () => false,
              isFIFO: () => false,
              isSocket: () => false,
              isSymbolicLink: () => false,
              path: removeWindowsPrefix(stat.path),
              parentPath: removeWindowsPrefix(stat.path),
            } as Dirent;
          });
          cb(null, dirents);
        })
        .catch(err => cb(err));
    },
    lstatSync(_path: string): Stats {
      throw new Error('Not Implemented');
    },
    promises: {
      lstat(path: string): Promise<Stats> {
        return _fs
          .isFile(removeWindowsPrefix(path))
          .then(isPathAFile => makeStats(isPathAFile));
      },
    },
  };
}
