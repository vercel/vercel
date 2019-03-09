/**
 * This is just a local copy of https://github.com/zeit/now-builders/pull/269.
 * This file can be removed if that PR is merged.
 */

import path from 'path';
import { glob as vanillaGlob, IOptions } from 'glob-gitignore';
import FileFsRef from '@now/build-utils/file-fs-ref';
import { BuilderInputs } from './types';

export async function glob(pattern: string, opts: IOptions | string = {}, mountpoint?: string): Promise<BuilderInputs> {
  let options: IOptions;
  if (typeof opts === 'string') {
    options = { cwd: opts };
  } else {
    options = opts;
  }

  if (!options.cwd) {
    options.cwd = process.cwd();
  }

  if (!path.isAbsolute(options.cwd)) {
    throw new Error(`basePath/cwd must be an absolute path (${options.cwd})`);
  }

  options.statCache = {};
  options.stat = true;
  options.dot = true;

  // eslint-disable-next-line consistent-return
  const files = await vanillaGlob(pattern, options);

  return files.reduce((files2: BuilderInputs, relativePath: string) => {
    const fsPath = path.join(options.cwd || '/', relativePath);
    const stat = options.statCache && options.statCache[fsPath];
    if (!stat) {
      throw new Error(`statCache does not contain value for ${relativePath} (resolved to ${fsPath})`);
    }
    if (stat && stat.isFile()) {
      let finalPath = relativePath;
      if (mountpoint) {
        finalPath = path.join(mountpoint, finalPath);
      }
      return {
        ...files2,
        [finalPath]: new FileFsRef({ mode: stat.mode, fsPath })
      };
    }

    return files2;
  }, {});
}
