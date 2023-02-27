import tar from 'tar';
import execa from 'execa';
import fetch from 'node-fetch';
import { mkdirp, pathExists, readFile, remove } from 'fs-extra';
import { join, delimiter } from 'path';
import stringArgv from 'string-argv';
import { cloneEnv, debug } from '@vercel/build-utils';
import XDGAppPaths from 'xdg-app-paths';
import type { Env } from '@vercel/build-utils';

const versionMap = new Map([
  ['1.20', '1.20.1'],
  ['1.19', '1.19.6'],
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
export const cacheDir = join('.vercel', 'cache', 'golang');
const getGoDir = (workPath: string) => join(workPath, cacheDir);
const GO_FLAGS = process.platform === 'win32' ? [] : ['-ldflags', '-s -w'];
const GO_MIN_VERSION = 13;
const getPlatform = (p: string) => platformMap.get(p) || p;
const getArch = (a: string) => archMap.get(a) || a;
const getGoUrl = (version: string, platform: string, arch: string) => {
  const goArch = getArch(arch);
  const goPlatform = getPlatform(platform);
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  return `https://dl.google.com/go/go${version}.${goPlatform}-${goArch}.${ext}`;
};

const goGlobalCachePath = join(XDGAppPaths('com.vercel.cli').cache(), 'golang');

export const OUT_EXTENSION = process.platform === 'win32' ? '.exe' : '';

export async function getAnalyzedEntrypoint(
  workPath: string,
  filePath: string,
  modulePath: string
) {
  const bin = join(__dirname, `analyze${OUT_EXTENSION}`);

  const isAnalyzeExist = await pathExists(bin);
  if (!isAnalyzeExist) {
    debug(`Building analyze bin: ${bin}`);
    const src = join(__dirname, 'util', 'analyze.go');
    const go = await createGo({
      workPath,
    });
    await go.build(src, bin);
  }

  debug(`Analyzing entrypoint ${filePath} with modulePath ${modulePath}`);
  const args = [`-modpath=${modulePath}`, filePath];
  const analyzed = await execa.stdout(bin, args);
  debug(`Analyzed entrypoint ${analyzed}`);
  return analyzed;
}

// Creates a `$GOPATH` directory tree, as per `go help gopath` instructions.
// Without this, `go` won't recognize the `$GOPATH`.
function createGoPathTree(
  goPath: string,
  platform: string = process.platform,
  arch: string = process.arch
) {
  const tuple = `${getPlatform(platform)}_${getArch(arch)}`;
  debug(`Creating GOPATH directory structure for ${goPath} (${tuple})`);
  return Promise.all([
    mkdirp(join(goPath, 'bin')),
    mkdirp(join(goPath, 'pkg', tuple)),
  ]);
}

class GoWrapper {
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
      `Exec: go ${args
        .map(a => (a.includes(' ') ? `"${a}"` : a))
        .join(' ')} CWD=${opts.cwd}`
    );
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

    const flags = process.env.GO_BUILD_FLAGS
      ? stringArgv(process.env.GO_BUILD_FLAGS)
      : GO_FLAGS;

    return this.execute('build', ...flags, '-o', dest, ...sources);
  }
}

const goVersionRegExp = /(\d+)\.(\d+)(?:\.(\d+))?/;

function parseGoVersionString(goVersionOutput: string) {
  const parts = goVersionOutput.match(goVersionRegExp);
  const major = parseInt((parts && parts[1]) || '0');
  const minor = parseInt((parts && parts[2]) || '0');
  const patch = parseInt((parts && parts[3]) || '0');
  return {
    version: `${major}.${minor}.${patch}`,
    short: `${major}.${minor}`,
    major,
    minor,
    patch,
  };
}

type CreateGoOptions = {
  goPath?: string;
  modulePath?: string;
  opts?: execa.Options;
  workPath: string;
};

export async function createGo({
  goPath,
  modulePath,
  opts = {},
  workPath,
}: CreateGoOptions) {
  if (goPath === undefined) {
    goPath = getGoDir(workPath);
  }

  // parse the `go.mod`, if exists
  let goPreferredVersion;
  let goVersion;
  if (modulePath) {
    goVersion = await parseGoModVersion(modulePath);
    goPreferredVersion = goVersion;
  }

  const env = cloneEnv(
    process.env,
    {
      GOPATH: goPath,
    },
    opts.env
  );

  if (goVersion) {
    debug(`Initializing go ${goVersion} (from go.mod)`);
    env.GO111MODULE = 'on';
  } else {
    // default to newest (first) supported go version
    goVersion = Array.from(versionMap.values())[0];
  }

  await createGoPathTree(goPath);

  const { arch, platform } = process;
  const goGlobalDir = join(
    goGlobalCachePath,
    `${goVersion}_${platform}_${arch}`
  );
  const goGlobalBinDir = join(goGlobalDir, 'bin');

  // check we have the desired `go` version cached
  if (await pathExists(goGlobalBinDir)) {
    // check if `go` has already been downloaded and that the version is correct
    const { failed, stdout } = await execa('go', ['version'], {
      env: {
        ...process.env,
        PATH: goGlobalBinDir,
      },
      reject: false,
    });
    if (!failed) {
      const { version, short } = parseGoVersionString(stdout);
      if (version === goVersion || short === goVersion) {
        debug(`Initializing go ${version} (from cache)`);
        env.PATH = `${goGlobalBinDir}${delimiter}${env.PATH}`;
        return new GoWrapper(env, opts);
      } else {
        debug(`Found cached go ${version}, but need ${goVersion}`);
      }
    }
  }

  if (!goPreferredVersion) {
    // check if `go` is installed in the system PATH and if it's the version we want
    const { failed, stdout } = await execa('go', ['version'], {
      reject: false,
    });
    if (!failed) {
      const { version, minor } = parseGoVersionString(stdout);
      if (minor < GO_MIN_VERSION) {
        debug(`Found go ${version} in system PATH, but version is unsupported`);
      } else if (!goVersion || goVersion === version) {
        debug(`Initializing go ${version} (from system PATH)`);
        return new GoWrapper(env, opts);
      } else {
        debug(
          `Found go ${version} in system PATH, but go.mod requests ${goVersion}`
        );
      }
    }
  }

  // we need to download and cache the desired `go` version
  const url = getGoUrl(goVersion, platform, arch);
  debug(`Downloading go: ${url}`);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download: ${url} (${res.status})`);
  }

  // TODO: use a zip extractor when `ext === "zip"`
  debug(`Installing go ${goVersion} to ${goGlobalDir}`);
  await remove(goGlobalDir);
  await mkdirp(goGlobalDir);
  await new Promise((resolve, reject) => {
    res.body
      .on('error', reject)
      .pipe(tar.extract({ cwd: goGlobalDir, strip: 1 }))
      .on('error', reject)
      .on('finish', resolve);
  });

  env.PATH = `${goGlobalBinDir}${delimiter}${env.PATH}`;
  return new GoWrapper(env, opts);
}

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
