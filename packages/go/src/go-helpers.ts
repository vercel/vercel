import tar from 'tar';
import execa from 'execa';
import fetch from 'node-fetch';
import {
  createWriteStream,
  mkdirp,
  pathExists,
  readFile,
  remove,
  symlink,
} from 'fs-extra';
import { delimiter, dirname, join } from 'path';
import stringArgv from 'string-argv';
import { cloneEnv, debug } from '@vercel/build-utils';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { tmpdir } from 'os';
import yauzl from 'yauzl-promise';
import XDGAppPaths from 'xdg-app-paths';
import type { Env } from '@vercel/build-utils';

const streamPipeline = promisify(pipeline);

const versionMap = new Map([
  ['1.22', '1.22.2'],
  ['1.21', '1.21.8'],
  ['1.20', '1.20.14'],
  ['1.19', '1.19.13'],
  ['1.18', '1.18.10'],
  ['1.17', '1.17.13'],
  ['1.16', '1.16.15'],
  ['1.15', '1.15.15'],
  ['1.14', '1.14.15'],
  ['1.13', '1.13.15'],
]);
const archMap = new Map([
  ['x64', 'amd64'],
  ['x86', '386'],
]);
const platformMap = new Map([['win32', 'windows']]);
export const localCacheDir = join('.vercel', 'cache', 'golang');

const GO_FLAGS = process.platform === 'win32' ? [] : ['-ldflags', '-s -w'];
const GO_MIN_VERSION = 13;

/**
 * Determines the URL to download the Golang SDK.
 * @param version The desireed Go version
 * @returns The Go download URL
 */
function getGoUrl(version: string) {
  const { arch, platform } = process;
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const goPlatform = platformMap.get(platform) || platform;
  let goArch = archMap.get(arch) || arch;

  // Go 1.16 was the first version to support arm64, so if the version is older
  // we need to download the amd64 version
  if (
    platform === 'darwin' &&
    goArch === 'arm64' &&
    parseInt(version.split('.')[1], 10) < 16
  ) {
    goArch = 'amd64';
  }

  const filename = `go${version}.${goPlatform}-${goArch}.${ext}`;
  return {
    filename,
    url: `https://dl.google.com/go/${filename}`,
  };
}

export const goGlobalCachePath = join(
  XDGAppPaths('com.vercel.cli').cache(),
  'golang'
);

export const OUT_EXTENSION = process.platform === 'win32' ? '.exe' : '';

interface Analyzed {
  functionName: string;
  packageName: string;
  watch?: boolean;
}

/**
 * Parses the AST of the specified entrypoint Go file.
 * @param workPath The work path (e.g. `/path/to/project`)
 * @param entrypoint The path to the entrypoint file (e.g.
 * `/path/to/project/api/index.go`)
 * @param modulePath The path to the directory containing the `go.mod` (e.g.
 * `/path/to/project/api`)
 * @returns The results from the AST parsing
 */
export async function getAnalyzedEntrypoint({
  entrypoint,
  modulePath,
  workPath,
}: {
  entrypoint: string;
  modulePath?: string;
  workPath: string;
}): Promise<Analyzed> {
  const bin = join(__dirname, `analyze${OUT_EXTENSION}`);
  let analyzed: string;

  try {
    // build the `analyze` binary if not found in the `dist` directory
    const isAnalyzeExist = await pathExists(bin);
    if (!isAnalyzeExist) {
      debug(`Building analyze bin: ${bin}`);
      const src = join(__dirname, '../analyze.go');
      let go;
      const createOpts = {
        modulePath,
        opts: { cwd: __dirname },
        workPath,
      };
      try {
        go = await createGo(createOpts);
      } catch (err) {
        // if the version in the `go.mod` is too old, then download the latest
        if (
          err instanceof GoError &&
          err.code === 'ERR_UNSUPPORTED_GO_VERSION'
        ) {
          delete createOpts.modulePath;
          go = await createGo(createOpts);
        } else {
          throw err;
        }
      }
      await go.build(src, bin);
    }
  } catch (err) {
    console.error('Failed to build the Go AST analyzer');
    throw err;
  }

  try {
    debug(`Analyzing entrypoint ${entrypoint} with modulePath ${modulePath}`);
    const args = [`-modpath=${modulePath}`, join(workPath, entrypoint)];
    analyzed = await execa.stdout(bin, args);
  } catch (err) {
    console.error(`Failed to parse AST for "${entrypoint}"`);
    throw err;
  }

  debug(`Analyzed entrypoint ${analyzed}`);

  if (!analyzed) {
    const err = new Error(
      `Could not find an exported function in "${entrypoint}"
Learn more: https://vercel.com/docs/functions/serverless-functions/runtimes/go
      `
    );
    console.error(err.message);
    throw err;
  }

  return JSON.parse(analyzed) as Analyzed;
}

export class GoWrapper {
  private env: Env;
  private opts: execa.Options;

  constructor(env: Env, opts: execa.Options = {}) {
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }
    this.env = env;
    this.opts = opts;
  }

  private execute(...args: string[]) {
    const { opts, env } = this;
    debug(
      `Exec: go ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
    );
    debug(`  CWD=${opts.cwd}`);
    debug(`  GOROOT=${(env || opts.env).GOROOT}`);
    debug(`  GO_BUILD_FLAGS=${(env || opts.env).GO_BUILD_FLAGS}`);
    return execa('go', args, { stdio: 'inherit', ...opts, env });
  }

  mod() {
    return this.execute('mod', 'tidy');
  }

  get(src?: string) {
    const args = ['get'];
    if (src) {
      debug(`Fetching 'go' dependencies for file ${src}`);
      args.push(src);
    } else {
      debug(`Fetching 'go' dependencies for cwd ${this.opts.cwd}`);
    }
    return this.execute(...args);
  }

  build(src: string | string[], dest: string) {
    debug(`Building optimized 'go' binary ${src} -> ${dest}`);
    const sources = Array.isArray(src) ? src : [src];

    const envGoBuildFlags = (this.env || this.opts.env).GO_BUILD_FLAGS;
    const flags = envGoBuildFlags ? stringArgv(envGoBuildFlags) : GO_FLAGS;

    return this.execute('build', ...flags, '-o', dest, ...sources);
  }
}

type CreateGoOptions = {
  modulePath?: string;
  opts?: execa.Options;
  workPath: string;
};

/**
 * Initializes a `GoWrapper` instance.
 *
 * This function determines the Go version to use by first looking in the
 * `go.mod`, if exists, otherwise uses the latest version from the version
 * map.
 *
 * Next it will attempt to find the desired Go version by checking the
 * following locations:
 *   1. The "local" project cache directory (e.g. `.vercel/cache/golang`)
 *   2. The "global" cache directory (e.g. `~/.cache/com.vercel.com/golang`)
 *   3. The system PATH
 *
 * If the Go version is not found, it's downloaded and installed in the
 * global cache directory so it can be shared across projects. When using
 * Linux or macOS, it creates a symlink from the global cache to the local
 * cache directory so that `prepareCache` will persist it.
 *
 * @param modulePath The path possibly containing a `go.mod` file
 * @param opts `execa` options (`cwd`, `env`, `stdio`, etc)
 * @param workPath The path to the project to be built
 * @returns An initialized `GoWrapper` instance
 */
export async function createGo({
  modulePath,
  opts = {},
  workPath,
}: CreateGoOptions): Promise<GoWrapper> {
  // parse the `go.mod`, if exists
  let goPreferredVersion: string | undefined;
  if (modulePath) {
    goPreferredVersion = await parseGoModVersion(modulePath);
  }

  // default to newest (first) supported go version
  const goSelectedVersion =
    goPreferredVersion || Array.from(versionMap.values())[0];

  const env = cloneEnv(process.env, opts.env);
  const { PATH } = env;
  const { platform } = process;
  const goGlobalCacheDir = join(
    goGlobalCachePath,
    `${goSelectedVersion}_${platform}_${process.arch}`
  );
  const goCacheDir = join(workPath, localCacheDir);

  if (goPreferredVersion) {
    debug(`Preferred go version ${goPreferredVersion} (from go.mod)`);
    env.GO111MODULE = 'on';
  } else {
    debug(
      `Preferred go version ${goSelectedVersion} (latest from version map)`
    );
  }

  const setGoEnv = async (goDir: string | null) => {
    if (platform !== 'win32' && goDir === goGlobalCacheDir) {
      debug(`Symlinking ${goDir} -> ${goCacheDir}`);
      await remove(goCacheDir);
      await mkdirp(dirname(goCacheDir));
      await symlink(goDir, goCacheDir);
      goDir = goCacheDir;
    }
    env.GOROOT = goDir || undefined;
    env.PATH = goDir ? `${join(goDir, 'bin')}${delimiter}${PATH}` : PATH;
  };

  // try each of these Go directories looking for the version we need
  const goDirs = {
    'local cache': goCacheDir,
    'global cache': goGlobalCacheDir,
    'system PATH': null,
  };

  for (const [label, goDir] of Object.entries(goDirs)) {
    try {
      const goBinDir = goDir && join(goDir, 'bin');
      if (goBinDir && !(await pathExists(goBinDir))) {
        debug(`Go not found in ${label}`);
        continue;
      }

      env.GOROOT = goDir || undefined;
      env.PATH = goBinDir || PATH;

      const { stdout } = await execa('go', ['version'], { env });
      const { minor, short, version } = parseGoVersionString(stdout);

      if (minor < GO_MIN_VERSION) {
        debug(`Found go ${version} in ${label}, but version is unsupported`);
      }
      if (version === goSelectedVersion || short === goSelectedVersion) {
        debug(`Selected go ${version} (from ${label})`);

        await setGoEnv(goDir);
        return new GoWrapper(env, opts);
      } else {
        debug(`Found go ${version} in ${label}, but need ${goSelectedVersion}`);
      }
    } catch {
      debug(`Go not found in ${label}`);
    }
  }

  // we need to download and cache the desired `go` version
  await download({
    dest: goGlobalCacheDir,
    version: goSelectedVersion,
  });

  await setGoEnv(goGlobalCacheDir);
  return new GoWrapper(env, opts);
}

/**
 * Download and installs the Go distribution.
 *
 * @param dest The directory to install Go into. If directory exists, it is
 * first deleted before installing.
 * @param version The Go version to download
 */
async function download({ dest, version }: { dest: string; version: string }) {
  const { filename, url } = getGoUrl(version);
  console.log(`Downloading go: ${url}`);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download: ${url} (${res.status})`);
  }

  debug(`Installing go ${version} to ${dest}`);

  await remove(dest);
  await mkdirp(dest);

  if (/\.zip$/.test(filename)) {
    const zipFile = join(tmpdir(), filename);
    try {
      await streamPipeline(res.body, createWriteStream(zipFile));
      const zip = await yauzl.open(zipFile);
      let entry = await zip.readEntry();
      while (entry) {
        const fileName = entry.fileName.split('/').slice(1).join('/');

        if (fileName) {
          const destPath = join(dest, fileName);

          if (/\/$/.test(fileName)) {
            await mkdirp(destPath);
          } else {
            const [entryStream] = await Promise.all([
              entry.openReadStream(),
              mkdirp(dirname(destPath)),
            ]);
            const out = createWriteStream(destPath);
            await streamPipeline(entryStream, out);
          }
        }

        entry = await zip.readEntry();
      }
    } finally {
      await remove(zipFile);
    }
    return;
  }

  await new Promise((resolve, reject) => {
    res.body
      .on('error', reject)
      .pipe(tar.extract({ cwd: dest, strip: 1 }))
      .on('error', reject)
      .on('finish', resolve);
  });
}

const goVersionRegExp = /(\d+)\.(\d+)(?:\.(\d+))?/;

/**
 * Parses the raw output from `go version` and returns the version parts.
 *
 * @param goVersionOutput The output from `go version`
 */
function parseGoVersionString(goVersionOutput: string) {
  const matches = goVersionOutput.match(goVersionRegExp) || [];
  const major = parseInt(matches[1], 10);
  const minor = parseInt(matches[2], 10);
  const patch = parseInt(matches[3] || '0', 10);
  return {
    version: `${major}.${minor}.${patch}`,
    short: `${major}.${minor}`,
    major,
    minor,
    patch,
  };
}

class GoError extends Error {
  code: string | undefined;
}

/**
 * Attempts to parse the preferred Go version from the `go.mod` file.
 *
 * @param modulePath The directory containing the `go.mod` file
 * @returns
 */
async function parseGoModVersion(
  modulePath: string
): Promise<string | undefined> {
  let version;
  const file = join(modulePath, 'go.mod');

  try {
    const content = await readFile(file, 'utf8');
    const matches = /^go (\d+)\.(\d+)\.?$/gm.exec(content) || [];
    const major = parseInt(matches[1], 10);
    const minor = parseInt(matches[2], 10);
    const full = versionMap.get(`${major}.${minor}`);
    if (major === 1 && minor >= GO_MIN_VERSION && full) {
      version = full;
    } else if (!isNaN(minor)) {
      const err = new GoError(
        `Unsupported Go version ${major}.${minor} in ${file}`
      );
      err.code = 'ERR_UNSUPPORTED_GO_VERSION';
      throw err;
    } else {
      console.log(`Warning: Unknown Go version in ${file}`);
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      debug(`File not found: ${file}`);
    } else {
      throw err;
    }
  }

  return version;
}
