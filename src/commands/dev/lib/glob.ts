/**
 * This is just a local copy of https://github.com/zeit/now-builders/pull/269.
 * This file can be removed if that PR is merged.
 */

import fs from 'fs';
import { inherits } from 'util';
import * as minimatch from 'minimatch';
import { Glob, IOptions } from 'glob';
import { Ignore } from '@zeit/dockerignore';
import { FileFsRef } from '@now/build-utils';
import { isAbsolute, join, relative } from 'path';
import { BuilderInputs } from './types';

export interface GlobIgnoreOptions extends minimatch.IOptions {
  cwd?: string;
  root?: string;
  dot?: boolean;
  nomount?: boolean;
  mark?: boolean;
  nosort?: boolean;
  stat?: boolean;
  silent?: boolean;
  strict?: boolean;
  cache?: { [path: string]: boolean | 'DIR' | 'FILE' | ReadonlyArray<string> };
  statCache?: { [path: string]: false | fs.Stats | undefined };
  symlinks?: { [path: string]: boolean | undefined };
  realpathCache?: { [path: string]: string };
  sync?: boolean;
  nounique?: boolean;
  nonull?: boolean;
  debug?: boolean;
  nobrace?: boolean;
  noglobstar?: boolean;
  noext?: boolean;
  nocase?: boolean;
  matchBase?: any;
  nodir?: boolean;
  ignore?: Ignore;
  follow?: boolean;
  realpath?: boolean;
  nonegate?: boolean;
  nocomment?: boolean;
  absolute?: boolean;
}

interface GlobCallback {
  (err: Error | null, results?: string[]): void;
}

/**
 * This `Glob` subclass extends the internal `_readdir()` function to
 * incorporate an `Ignore` instance from `@zeit/dockerignore`.
 *
 * Based on `https://npmjs.org.glob-gitignore` but simplified for our purposes.
 */
const IGNORE = Symbol('GlobIgnore');

export function GlobIgnore(
  pattern: string,
  options: IOptions,
  callback: GlobCallback,
  shouldIgnore: (val: string) => boolean
) {
  // @ts-ignore
  this[IGNORE] = shouldIgnore;
  // @ts-ignore
  Glob.call(this, pattern, options, callback);
}

inherits(GlobIgnore, Glob);

GlobIgnore.prototype._readdir = function _readdir(
  abs: string,
  inGlobStar: boolean,
  cb: GlobCallback
) {
  const marked = this._mark(abs);
  const rel = relative(this.cwd, marked);

  if (rel && this[IGNORE] && this[IGNORE](rel)) {
    return cb(null);
  }

  // @ts-ignore
  Glob.prototype._readdir.call(
    this,
    abs,
    inGlobStar,
    (err: Error, results?: string[]): void => {
      if (err) return cb(err);
      cb(
        null,
        results && results.filter(r => !(this[IGNORE] && this[IGNORE](r)))
      );
    }
  );
};

export async function glob(
  pattern: string,
  opts: GlobIgnoreOptions = {}
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const ignore = opts.ignore;
    const shouldIgnore = ignore
      ? (val: string): boolean => ignore.ignores(val)
      : () => false;
    delete opts.ignore;
    // @ts-ignore
    new GlobIgnore(
      pattern,
      opts as IOptions,
      (err: Error | null, results?: string[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      },
      shouldIgnore
    );
  });
}

export async function globBuilderInputs(
  pattern: string,
  opts: GlobIgnoreOptions = {},
  mountpoint?: string
): Promise<BuilderInputs> {
  let options: GlobIgnoreOptions;
  if (typeof opts === 'string') {
    options = { cwd: opts };
  } else {
    options = opts;
  }

  if (!options.cwd) {
    options.cwd = process.cwd();
  }

  if (!isAbsolute(options.cwd)) {
    throw new Error(`basePath/cwd must be an absolute path (${options.cwd})`);
  }

  options.statCache = {};
  options.stat = true;
  options.dot = true;

  // eslint-disable-next-line consistent-return
  const files = await glob(pattern, options);

  return files.reduce((files2: BuilderInputs, relativePath: string) => {
    const fsPath = join(options.cwd || '/', relativePath);
    const stat: fs.Stats | false | undefined =
      options.statCache && options.statCache[fsPath];
    if (!stat) {
      throw new Error(
        `statCache does not contain value for ${relativePath} (resolved to ${fsPath})`
      );
    }
    if (!stat.isDirectory()) {
      let finalPath = relativePath;
      if (mountpoint) {
        finalPath = join(mountpoint, finalPath);
      }
      return {
        ...files2,
        [finalPath]: new FileFsRef({ mode: stat.mode, fsPath })
      };
    }

    return files2;
  }, {});
}
