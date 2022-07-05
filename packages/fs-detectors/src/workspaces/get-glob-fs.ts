import fs from 'fs';
import { DetectorFilesystem } from '../detectors/filesystem';

type GlobFs = typeof fs;

function removeWindowsPrefix(path: string) {
  // on windows, this will return a path like
  // D:/c/package.json
  // since we abstract the filesystem, we need to remove windows specific info from the path
  // and let the FS decide how to process the path
  // D:/c/package.json => /c/package.json
  return path.replace(/^[a-zA-Z]:/, '');
}

export function getGlobFs(_fs: DetectorFilesystem): GlobFs {
  const readdir = (
    path: fs.PathLike,
    callback: (err: NodeJS.ErrnoException | null, files: string[]) => void
  ): void => {
    _fs
      .readdir(removeWindowsPrefix(String(path)))
      .then(stats =>
        callback(
          null,
          stats.map(stat => stat.name)
        )
      )
      .catch(err => callback(err, []));
  };

  const stat = (
    path: fs.PathLike,
    callback: (
      err: NodeJS.ErrnoException | null,
      stats: fs.Stats | null
    ) => void
  ): void => {
    _fs
      .isFile(removeWindowsPrefix(String(path)))
      .then(isPathAFile => {
        callback(null, {
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
        });
      })
      .catch(err => callback(err, null));
  };

  return new Proxy(fs, {
    get(_target, prop) {
      switch (prop) {
        case 'readdir':
          return readdir;
        case 'lstat':
        case 'stat':
          return stat;
        default:
          throw new Error('Not Implemented');
      }
    },
  });
}
