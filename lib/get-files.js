import bytes from 'bytes';
import flatten from 'arr-flatten';
import unique from 'array-unique';
import minimatch from 'minimatch';
import IGNORED from './ignored';
import { resolve } from 'path';
import { stat, readdir, readFile } from 'fs-promise';

const ONEMB = bytes('1mb');

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized.
 *
 * @param {String} full path to directory
 * @return {Array} comprehensive list of paths to sync
 */

export default async function getFiles (path, pkg) {
  if (!pkg) {
    const pkgPath = resolve(path, 'package.json');
    const pkgData = await readFile(pkgPath, 'utf8');
    pkg = JSON.parse(pkgData);
  }

  let search = (pkg.files || ['.']).concat('package.json');
  if (pkg.main) search = search.concat(pkg.main);
  search = search.map((file) => asAbsolute(file, path));

  const found = unique((await explode(search)));

  const npmIgnore = await maybeRead(resolve(path, '.npmignore'));
  const gitIgnore = npmIgnore
    ? ''
    : (await maybeRead(resolve(path, '.gitignore')));

  const ignored = unique(IGNORED
  .concat(gitIgnore.split('\n').filter(invalidFilter))
  .concat(npmIgnore.split('\n').filter(invalidFilter)))
  .map(file => resolve(path, file));

  return found.filter(ignoredFilter(ignored));
}

/**
 * Returns a filter function that
 * excludes ignored files in the path.
 *
 * @param {String} path
 * @return {Function} filter fn
 */

const ignoredFilter = (ignored) => (file) => {
  return !ignored.some((test) => {
    // test that the target file is not under
    // an ignored directory
    const dir = test + '/';
    if (file.substr(0, dir.length) === dir) return true;

    // if not match wildcards
    return minimatch(file, test);
  });
};

/**
 * Returns a filter function that
 * excludes invalid rules for .*ignore files
 *
 * @param {String} path
 * @return {Function} filter fn
 */

const invalidFilter = (path) => {
  return !(
    /* commments */
    '#' === path[0] ||

    /* empty lines or newlines */
    !path.trim().length
  );
};

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
 * @return {Array} of {String}s of full paths
 */

const explode = async function (paths) {
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
      s = await stat(path);
    }

    if (s.isDirectory()) {
      const all = await readdir(file);
      return many(all.map(subdir => asAbsolute(subdir, file)));
    } else {
      if (s.size > ONEMB) {
        console.error(`> \u001b[31mWarning!\u001b[39m Skipping file over 1MB: ${path}`);
      }

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
