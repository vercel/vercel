import assert from 'assert';
import path from 'path';
import vanillaGlob from 'glob';
import FileFsRef from '../file-fs-ref';

type GlobOptions = import('glob').IOptions;
 
interface FsFiles {
  [filePath: string]: FileFsRef
}

export default function glob(pattern: string, opts: GlobOptions | string, mountpoint: string): Promise<FsFiles> {
  return new Promise<FsFiles>((resolve, reject) => {
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

    options.statCache = {};
    options.stat = true;
    options.dot = true;

    // eslint-disable-next-line consistent-return
    vanillaGlob(pattern, options, (error, files) => {
      if (error) return reject(error);

      resolve(
        files.reduce<FsFiles>((files2, relativePath) => {
          const fsPath = path.join(options.cwd!, relativePath);
          const stat = options.statCache![fsPath] as import('fs').Stats;
          assert(
            stat,
            `statCache does not contain value for ${relativePath} (resolved to ${fsPath})`,
          );
          if (stat && stat.isFile()) {
            let finalPath = relativePath;
            if (mountpoint) finalPath = path.join(mountpoint, finalPath);
            return {
              ...files2,
              [finalPath]: new FileFsRef({ mode: stat.mode, fsPath }),
            };
          }

          return files2;
        }, {}),
      );
    });
  });
};
