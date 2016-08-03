import flatten from 'arr-flatten';
import unique from 'array-unique';
import minimatch from 'minimatch';
import IGNORED from './ignored';
import { resolve } from 'path';
import { stat, readdir, readFile } from 'fs-promise';
import parser from 'gitignore-parser';

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized for npm.
 *
 * @param {String} full path to directory
 * @param {String} contents of `package.json` to avoid lookup
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `debug` {Boolean} warn upon ignore
 * @return {Array} comprehensive list of paths to sync
 */

export async function npm (path, pkg, {
  limit = null,
  debug = false
}) {
  // the package.json `files` whitelist still
  // honors ignores: https://docs.npmjs.com/files/package.json#files
  let search = (whitelist || ['.']).push('package.json');

  // always include the "main" file
  if (pkg.main) {
    search.push(pkg.main);
  }

  // always include binary files
  if (pkg.bin) {
    for (const script in pkg.bin) {
      search.push(pkg.bin[script]);
    }
  }

  // convert all filenames into absolute paths
  search = search.map((file) => asAbsolute(file, path));

  // locate files
  if (debug) console.time('> [debug] locating files');
  const files = await explode(search, { limit, debug });
  if (debug) console.timeEnd('> [debug] locating files');

  // compile list of ignored patterns and files
  const npmIgnore = await maybeRead(resolve(path, '.npmignore'));
  const ignored = parser.compile(
    IGNORED +
    '\n' +
    npmIgnore
      ? npmIgnore
      : await maybeRead(resolve(path, '.gitignore'))
  );

  // if debugging is turned on, describe which files
  // are being ignored
  const accepts = debug ? function (file) {
    const accepted = ignored.accepts(file);
    if (!accepted) {
      console.log('> [debug] ignoring "%s"', file);
    }
    return accepted;
  } : ignored.accepts;

  // get files
  return unique(files.filter(accepts));
}

/**
 * Transform relative paths into absolutes,
 * and maintains absolutes as such.
 *
 * @param {String} maybe relative path
 * @param {String} parent full path
 */

const asAbsolute = function (path, parent) {
  if ('/' === path[0]) return path;
  return resolve(parent, path);
};

/**
 * Explodes directories into a full list of files.
 * Eg:
 *   in:  ['/a.js', '/b']
 *   out: ['/a.js', '/b/c.js', '/b/d.js']
 *
 * @param {Array} of {String}s representing paths
 * @param {Array} of ignored {String}s.
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `debug` {Boolean} warn upon ignore
 * @return {Array} of {String}s of full paths
 */

const explode = async function (paths, { limit, debug }) {
  const many = async (all) => {
    return await Promise.all(all.map(async (file) => {
      return await list(file);
    }));
  };

  const list = async (file) => {
    let path = file;
    let s;

    try {
      s = await stat(path);
    } catch (e) {
      // in case the file comes from `files` or `main`
      // and it wasn't specified with `.js` by the user
      path = file + '.js';

      try {
        s = await stat(path);
      } catch (e2) {
        return null;
      }
    }

    if (s.isDirectory()) {
      const all = await readdir(file);
      return many(all.map(subdir => asAbsolute(subdir, file)));
    } else {
      return path;
    }
  };

  return flatten((await many(paths))).filter((v) => null != v);
};

/**
 * Returns the contents of a file if it exists.
 *
 * @return {String} results or `''`
 */

const maybeRead = async function (path) {
  try {
    return (await readFile(path, 'utf8'));
  } catch (e) {
    return '';
  }
};
