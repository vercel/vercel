import fs, { readFile as read } from 'fs-promise';
import { resolve } from 'path';
import flatten from 'arr-flatten';
import unique from 'array-unique';
import minimatch from 'minimatch';
import IGNORED from './ignored';

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized.
 *
 * @param {String} full path to directory
 * @return {Array} comprehensive list of paths to sync
 */

export default async function getFiles (path) {
  const pkgData = await read(resolve(path, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgData);

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
    let stat;

    try {
      stat = await fs.stat(path);
    } catch (e) {
      // in case the file comes from `files` or `main`
      // and it wasn't specified with `.js` by the user
      path = file + '.js';
      stat = await fs.stat(path);
    }

    if (stat.isDirectory()) {
      const all = await fs.readdir(file);
      return many(all.map(subdir => asAbsolute(subdir, file)));
    } else {
      return path;
    }
  };

  return flatten((await many(paths)));
};

/**
 * Returns the contents of a file if it exists.
 *
 * @return {String} results or `''`
 */

const maybeRead = async function (path) {
  try {
    return (await fs.readFile(path, 'utf8'));
  } catch (e) {
    return '';
  }
};
