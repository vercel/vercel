import fs from 'fs-extra';
import { resolve } from 'path';
import { getVercelIgnore } from '@vercel/client';
import uniqueStrings from './unique-strings';
import output from '../output-manager';

type NullableString = string | null;

function flatten(
  arr: NullableString[] | NullableString[][],
  res: NullableString[] = []
): NullableString[] {
  for (const cur of arr) {
    if (Array.isArray(cur)) {
      flatten(cur, res);
    } else {
      res.push(cur);
    }
  }
  return res;
}

/**
 * Transform relative paths into absolutes,
 * and maintains absolutes as such.
 *
 * @param {String} maybe relative path
 * @param {String} parent full path
 */

const asAbsolute = function (path: string, parent: string) {
  if (path[0] === '/') {
    return path;
  }

  return resolve(parent, path);
};

interface StaticFilesOptions {
  src?: string;
}

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized for static deployments.
 *
 * @param {String} full path to directory
 * @param {Object} options:
 *  - `output` {Object} "output" helper object
 *  - `src` {string|undefined} optional builder source
 * @return {Array} comprehensive list of paths to sync
 */

export async function staticFiles(
  path: string,
  { src }: StaticFilesOptions
): Promise<string[]> {
  const { debug, time } = output;
  let files: string[] = [];

  // The package.json `files` whitelist still
  // honors ignores: https://docs.npmjs.com/files/package.json#files
  const source = src || '.';

  // Ensure that `path` is an absolute path
  const search = resolve(path, source);

  // Compile list of ignored patterns and files
  const { ig } = await getVercelIgnore(path);
  const filter = ig.createFilter();

  const prefixLength = path.length + 1;

  // The package.json `files` whitelist still
  // honors npmignores: https://docs.npmjs.com/files/package.json#files
  // but we don't ignore if the user is explicitly listing files
  // under the now namespace, or using files in combination with gitignore
  const accepts = (file: string) => {
    const relativePath = file.slice(prefixLength);

    if (relativePath === '') {
      return true;
    }

    const accepted = filter(relativePath);

    if (!accepted) {
      debug(`Ignoring ${file}`);
    }

    return accepted;
  };

  // Locate files
  files = await time(
    `Locating files ${path}`,
    explode([search], {
      accepts,
    })
  );

  // Get files
  return uniqueStrings(files);
}

interface ExplodeOptions {
  accepts: (file: string) => boolean;
}

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
 *  - `output` {Object} "output" helper object
 * @return {Array} of {String}s of full paths
 */
async function explode(
  paths: string[],
  { accepts }: ExplodeOptions
): Promise<string[]> {
  const { debug } = output;
  const list = async (file: string): Promise<string | null> => {
    let path = file;
    let s: fs.Stats;

    if (!accepts(file)) {
      return null;
    }

    try {
      s = await fs.stat(path);
    } catch (e) {
      // In case the file comes from `files`
      // and it wasn't specified with `.js` by the user
      path = `${file}.js`;

      try {
        s = await fs.stat(path);
      } catch (e2) {
        debug(`Ignoring invalid file ${file}`);
        return null;
      }
    }

    if (s.isDirectory()) {
      const all = await fs.readdir(file);
      /* eslint-disable no-use-before-define */
      const recursive = many(all.map(subdir => asAbsolute(subdir, file)));
      return recursive as any as Promise<string | null>;
      /* eslint-enable no-use-before-define */
    }
    if (!s.isFile()) {
      debug(`Ignoring special file ${file}`);
      return null;
    }

    return path;
  };

  const many = (all: string[]) => Promise.all(all.map(file => list(file)));
  const arrayOfArrays = await many(paths);
  return flatten(arrayOfArrays).filter(notNull);
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}
