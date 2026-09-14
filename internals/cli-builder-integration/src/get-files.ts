import fs from 'fs-extra';
import { resolve } from 'path';
import { getVercelIgnore } from '@vercel/client';

interface FileOutput {
  debug(value: unknown): void;
  time<T>(name: string, promise: Promise<T>): Promise<T>;
}

type RecursiveFiles = string | null | RecursiveFiles[];

function flatten(
  arr: RecursiveFiles[],
  res: Array<string | null> = []
): Array<string | null> {
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
  { src }: StaticFilesOptions,
  output: FileOutput
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
      output,
    })
  );

  // Get files
  return Array.from(new Set(files));
}

interface ExplodeOptions {
  accepts: (file: string) => boolean;
  output: FileOutput;
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
  const list = async (file: string): Promise<RecursiveFiles> => {
    let path = file;
    let s: fs.Stats;

    if (!accepts(file)) {
      return null;
    }

    try {
      s = await fs.stat(path);
    } catch (_e) {
      // In case the file comes from `files`
      // and it wasn't specified with `.js` by the user
      path = `${file}.js`;

      try {
        s = await fs.stat(path);
      } catch (_e2) {
        debug(`Ignoring invalid file ${file}`);
        return null;
      }
    }

    if (s.isDirectory()) {
      let all: string[];
      try {
        all = await fs.readdir(file);
      } catch (err: unknown) {
        // The directory may have been removed between the `stat()` above and
        // this `readdir()` (a common race with tools that churn temporary
        // files, e.g. `cargo build` writing to `target/`). Skip it instead of
        // crashing the whole scan.
        const code =
          err instanceof Error && 'code' in err ? err.code : undefined;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          debug(`Ignoring directory that has since been removed ${file}`);
          return null;
        }
        throw err;
      }
      return many(all.map(subdir => asAbsolute(subdir, file)));
      /* eslint-enable no-use-before-define */
    }
    if (!s.isFile()) {
      debug(`Ignoring special file ${file}`);
      return null;
    }

    return path;
  };

  const many = (all: string[]): Promise<RecursiveFiles[]> =>
    Promise.all(all.map(file => list(file)));
  const arrayOfArrays = await many(paths);
  return flatten(arrayOfArrays).filter(notNull);
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}
