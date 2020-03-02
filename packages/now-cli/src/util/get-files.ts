import fs from 'fs-extra';
import { resolve, join } from 'path';
import _glob, { IOptions } from 'glob';
import { getNowIgnore } from 'now-client';
import uniqueStrings from './unique-strings';
import { Output } from './output/create-output';

type NullableString = string | null;

const flatten = (
  arr: NullableString[] | NullableString[][],
  res: NullableString[] = []
) => {
  for (let cur of arr) {
    if (Array.isArray(cur)) {
      flatten(cur, res);
    } else {
      res.push(cur);
    }
  }
  return res;
};

const glob = async function(pattern: string, options: IOptions) {
  return new Promise<string[]>((resolve, reject) => {
    _glob(pattern, options, (error, files) => {
      if (error) {
        reject(error);
      } else {
        resolve(files);
      }
    });
  });
};

/**
 * Transform relative paths into absolutes,
 * and maintains absolutes as such.
 *
 * @param {String} maybe relative path
 * @param {String} parent full path
 */

const asAbsolute = function(path: string, parent: string) {
  if (path[0] === '/') {
    return path;
  }

  return resolve(parent, path);
};

interface StaticFilesOptions {
  output: Output;
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
  { output, src }: StaticFilesOptions
) {
  const { debug, time } = output;

  // The package.json `files` whitelist still
  // honors ignores: https://docs.npmjs.com/files/package.json#files
  const source = src || '.';
  // Convert all filenames into absolute paths
  const search = await glob(source, { cwd: path, absolute: true, dot: true });

  // Compile list of ignored patterns and files
  const { ig } = await getNowIgnore(resolve(path, '.nowignore'));
  const filter = ig.createFilter();

  const prefixLength = path.length + 1;

  // The package.json `files` whitelist still
  // honors npmignores: https://docs.npmjs.com/files/package.json#files
  // but we don't ignore if the user is explicitly listing files
  // under the now namespace, or using files in combination with gitignore
  const accepts = (file: string) => {
    const relativePath = file.substr(prefixLength);

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
  const files = await time(
    `Locating files ${path}`,
    explode(search, {
      accepts,
      output,
    })
  );

  // Get files
  return uniqueStrings(files);
}

/**
 * Get a list of all files inside the project folder
 *
 * @param {String} of the current working directory
 * @param {Object} output instance
 * @return {Array} of {String}s with the found files
 */
export async function getAllProjectFiles(cwd: string, { debug }: Output) {
  // We need a slash at the end to remove it later on from the matched files
  const current = join(resolve(cwd), '/');
  debug(`Searching files inside of ${current}`);

  const list = await glob('**', { cwd: current, absolute: true, nodir: true });

  // We need to replace \ with / for windows
  return list.map(file => file.replace(current.replace(/\\/g, '/'), ''));
}

interface ExplodeOptions {
  accepts: (file: string) => boolean;
  output: Output;
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
  { accepts, output }: ExplodeOptions
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
      return (recursive as any) as Promise<string | null>;
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
