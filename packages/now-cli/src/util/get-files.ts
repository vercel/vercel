import { resolve, join } from 'path';
import ignore from 'ignore';
import dockerignore from '@zeit/dockerignore';
import _glob, { IOptions } from 'glob';
import fs from 'fs-extra';
import IGNORED from './ignored';
import uniqueStrings from './unique-strings';
import getLocalConfigPath from './config/local-path';
import { Output } from './output/create-output';
import { NowConfig } from './dev/types';

type NullableString = string | null;

const flatten = (arr: NullableString[] | NullableString[][], res: NullableString[] = []) => {
  for (let cur of arr) {
    if (Array.isArray(cur)) {
      flatten(cur, res);
    } else {
      res.push(cur);
    }
  }
  return res;
}

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

interface WalkSyncOptions {
  output: Output;
}

/**
 * Will recursivly walk through a directory and return an array of the files found within.
 * @param {string} dir the directory to walk
 * @param {string} path the path to this directory
 * @param {Array[string]} filelist a list of files so far identified
 * @param {Object} options
 *  - `output` {Object} "output" helper object
 * @returns {Array}
 */
const walkSync = async (dir: string, path: string, filelist: string[] = [], opts: WalkSyncOptions) => {
  const { debug } = opts.output;
  const dirc = await fs.readdir(asAbsolute(dir, path));
  for (let file of dirc) {
    file = asAbsolute(file, dir);
    try {
      const file_stat = await fs.stat(file);
      filelist = file_stat.isDirectory()
        ? await walkSync(file, path, filelist, opts)
        : filelist.concat(file);
    } catch (e) {
      debug(`Ignoring invalid file ${file}`);
    }
  }
  return filelist;
};

interface FilesInWhitelistOptions {
  output: Output;
}

/**
 * Will return an array containing the expaneded list of all files included in the whitelist.
 * @param {Array[string]} whitelist array of files and directories to include.
 * @param {string} path the path of the deployment.
 * @param {Object} options
 *  - `output` {Object} "output" helper object
 * @returns {Array} the expanded list of whitelisted files.
 */
const getFilesInWhitelist = async function(whitelist: string[], path: string, opts: FilesInWhitelistOptions) {
  const { debug } = opts.output;
  const files: string[] = [];

  await Promise.all(
    whitelist.map(async (file: string) => {
      file = asAbsolute(file, path);
      try {
        const file_stat = await fs.stat(file);
        if (file_stat.isDirectory()) {
          const dir_files = await walkSync(file, path, [], opts);
          files.push(...dir_files);
        } else {
          files.push(file);
        }
      } catch (e) {
        debug(`Ignoring invalid file ${file}`);
      }
    })
  );
  return files;
};

/**
 * Remove leading `./` from the beginning of ignores
 * because ignore doesn't like them :|
 */

const clearRelative = function(str: string) {
  return str.replace(/(\n|^)\.\//g, '$1');
};

/**
 * Returns the contents of a file if it exists.
 *
 * @return {String} results or `''`
 */

const maybeRead = async function<T>(path: string, default_: T) {
  try {
    return await fs.readFile(path, 'utf8');
  } catch (err) {
    return default_;
  }
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

export async function createIgnore(ignoreFilePath: string) {
  const ignoreFile = await maybeRead(ignoreFilePath, '');
  const ig = ignore()
    .add(`${IGNORED}\n${clearRelative(ignoreFile)}`);
  return ig;
}

interface StaticFilesOptions {
  output: Output;
  isBuilds: boolean;
  src?: string;
}

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized for static deployments.
 *
 * @param {String} full path to directory
 * @param {Object} options:
 *  - `isBuilds` {boolean} true for Now 2.0 builders
 *  - `output` {Object} "output" helper object
 *  - `src` {string|undefined} optional builder source
 * @return {Array} comprehensive list of paths to sync
 */

export async function staticFiles(
  path: string,
  nowConfig: NowConfig = {},
  { output, isBuilds, src }: StaticFilesOptions
) {
  const { debug, time } = output;
  let files: string[] = [];

  if (!isBuilds && nowConfig.files && Array.isArray(nowConfig.files)) {
    files = await getFilesInWhitelist(nowConfig.files, path, { output });
  } else {
    // The package.json `files` whitelist still
    // honors ignores: https://docs.npmjs.com/files/package.json#files
    const source = src || '.';
    // Convert all filenames into absolute paths
    const search = await glob(source, { cwd: path, absolute: true, dot: true });

    // Compile list of ignored patterns and files
    const ignoreName = isBuilds ? '.nowignore' : '.gitignore';
    const ig = await createIgnore(resolve(path, ignoreName));
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
    files = await time(
      `Locating files ${path}`,
      explode(search, {
        accepts,
        output
      })
    );
  }

  // Get files
  return uniqueStrings(files);
}

interface NpmOptions {
  hasNowJson: boolean;
  output: Output;
}

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized for npm.
 *
 * @param {String} full path to directory
 * @param {String} contents of `package.json` to avoid lookup
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `output` {Object} "output" helper object
 * @return {Array} comprehensive list of paths to sync
 */
export async function npm(
  path: string,
  pkg: { files?: string[], now?: { files?: string[] } } = {},
  nowConfig: NowConfig = {},
  { hasNowJson = false, output }: NpmOptions
) {
  const { debug, time } = output;
  const whitelist = nowConfig.files || pkg.files || (pkg.now && pkg.now.files);
  let files: string[] = [];

  if (whitelist) {
    files = await getFilesInWhitelist(whitelist, path, { output });
  } else {
    // The package.json `files` whitelist still
    // honors ignores: https://docs.npmjs.com/files/package.json#files
    const search_ = ['.'];
    // Convert all filenames into absolute paths
    const search = Array.prototype.concat.apply(
      [],
      await Promise.all(
        search_.map(file =>
          glob(file, { cwd: path, absolute: true, dot: true })
        )
      )
    );

    // Compile list of ignored patterns and files
    const npmIgnore = await maybeRead(resolve(path, '.npmignore'), null);

    const filter = ignore()
      .add(
        `${IGNORED}\n${clearRelative(
          npmIgnore === null
            ? await maybeRead(resolve(path, '.gitignore'), '')
            : npmIgnore
        )}`
      )
      .createFilter();

    const prefixLength = path.length + 1;

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
    files = await time(
      `Locating files ${path}`,
      explode(search, {
        accepts,
        output
      })
    );
  }

  // Always include manifest as npm does not allow ignoring it
  // source: https://docs.npmjs.com/files/package.json#files
  files.push(asAbsolute('package.json', path));

  if (hasNowJson) {
    files.push(asAbsolute(getLocalConfigPath(path), path));
  }

  // Get files
  return uniqueStrings(files);
}

interface DockerOptions {
  hasNowJson: boolean;
  output: Output;
}

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * sent to docker as build context.
 *
 * @param {String} full path to directory
 * @param {String} contents of `Dockerfile`
 * @param {Object} options:
 *  - `limit` {Number|null} byte limit
 *  - `output` {Object} "output" helper object
 * @return {Array} comprehensive list of paths to sync
 */

export async function docker(
  path: string,
  nowConfig: NowConfig = {},
  { hasNowJson = false, output }: DockerOptions
) {
  const { debug, time } = output;
  let files: string[] = [];

  if (nowConfig.files) {
    files = await getFilesInWhitelist(nowConfig.files, path, { output });
  } else {
    // Base search path
    // the now.json `files` whitelist still
    // honors ignores: https://docs.npmjs.com/files/package.json#files
    const search_ = ['.'];

    // Convert all filenames into absolute paths
    const search = search_.map(file => asAbsolute(file, path));

    // Compile list of ignored patterns and files
    const dockerIgnore = await maybeRead(resolve(path, '.dockerignore'), null);

    const ignoredFiles = clearRelative(
      dockerIgnore === null
        ? await maybeRead(resolve(path, '.gitignore'), '')
        : dockerIgnore
    );
    const ignoreInit = (dockerIgnore === null ? ignore : dockerignore) as any as typeof ignore;
    const filter = ignoreInit()
      .add(`${IGNORED}\n${ignoredFiles}`)
      .createFilter();

    const prefixLength = path.length + 1;
    const accepts = function(file: string) {
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
    files = await time(
      `Locating files ${path}`,
      explode(search, { accepts, output })
    );
  }

  if (hasNowJson) {
    files.push(asAbsolute(getLocalConfigPath(path), path));
  }

  // Always include manifest as npm does not allow ignoring it
  // source: https://docs.npmjs.com/files/package.json#files
  files.push(asAbsolute('Dockerfile', path));

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
  return list.map((file) => file.replace(current.replace(/\\/g, '/'), ''));
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
async function explode(paths: string[], { accepts, output }: ExplodeOptions): Promise<string[]> {
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
