import tar from 'tar';
import execa from 'execa';
import fetch from 'node-fetch';
import { mkdirp, pathExists, readFile } from 'fs-extra';
import { join, delimiter } from 'path';
import stringArgv from 'string-argv';
import { debug } from '@vercel/build-utils';

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

export const OUT_EXTENSION = process.platform === 'win32' ? '.exe' : '';

export async function getAnalyzedEntrypoint(
  workPath: string,
  filePath: string,
  modulePath: string
) {
  debug(`Analyzing entrypoint ${filePath} with modulePath ${modulePath}`);
  const bin = join(__dirname, `analyze${OUT_EXTENSION}`);

  const isAnalyzeExist = await pathExists(bin);
  if (isAnalyzeExist) {
    debug(`Analyze bin exists, skipping building ${bin}`);
  } else {
    const src = join(__dirname, 'util', 'analyze.go');
    const go = await createGo({
      modulePath,
      workPath,
    });
    await go.build(src, bin);
  }

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
  private env: Record<string, string>;
  private opts: execa.Options;

  constructor(env: { [key: string]: string }, opts: execa.Options = {}) {
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }
    this.env = env;
    this.opts = opts;
  }

  private execute(...args: string[]) {
    const { opts, env } = this;
    debug(`Exec: go ${args.join(' ')} CWD=${opts.cwd}`);
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
  const major = parseInt(parts?.[1] || '0');
  const minor = parseInt(parts?.[2] || '0');
  const patch = parseInt(parts?.[3] || '0');
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
  modulePath: string;
  opts?: execa.Options;
  workPath: string;
};

export async function createGo({
  goPath,
  modulePath,
  opts = {},
  workPath,
}: CreateGoOptions) {
  // the .vercel/cache/go directory; used if `go.mod` exists and has specific
  // version or `go` not installed on system
  const goDir = goPath || getGoDir(workPath);
  const goBinDir = join(goDir, 'bin');

  const env: Record<string, string> = {
    ...process.env,
    GOPATH: goDir,
    ...opts.env,
  };

  // parse the `go.mod`, if exists
  let goVersion = await parseGoVersion(modulePath);

  if (goVersion) {
    env.GO111MODULE = 'on';
  }

  await createGoPathTree(goDir);

  if (!goVersion) {
    // we do *not* have a `go.mod` with a specific version to use
    // check if `go` is in the system PATH
    const { failed, stdout } = await execa('go', ['version'], {
      reject: false,
    });
    if (!failed) {
      const { minor } = parseGoVersionString(stdout);
      if (minor >= GO_MIN_VERSION) {
        debug(`Using system installed version of 'go': ${stdout.trim()}`);
        return new GoWrapper(env, opts);
      }
    }

    // `go` not found in the system PATH
    // default to newest (first) supported go version
    goVersion = Array.from(versionMap.values())[0];
  }

  // at this point, we are going to be using `go` from the cache directory,
  // so let's add it to the PATH now
  const binPath = join(getGoDir(workPath), 'bin');
  debug(`Adding ${binPath} to PATH`);
  env.PATH = `${binPath}${delimiter}${env.PATH}`;

  // check we have the desired `go` version cached
  if (await pathExists(goBinDir)) {
    // check if `go` has already been downloaded and that the version is correct
    const { failed, stdout } = await execa('go', ['version'], {
      env: {
        ...process.env,
        PATH: goBinDir,
      },
      reject: false,
    });
    if (!failed) {
      const { version, short } = parseGoVersionString(stdout);
      if (version === goVersion || short === goVersion) {
        debug(`Using cached version of 'go': ${stdout.trim()}`);
        return new GoWrapper(env, opts);
      }
    }
  }

  // we need to download and cache the desired `go` version
  const { arch, platform } = process;
  debug(`Installing 'go' v${goVersion} to ${goDir} for ${platform} ${arch}`);
  const url = getGoUrl(goVersion, platform, arch);
  debug(`Downloading 'go' URL: ${url}`);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download: ${url} (${res.status})`);
  }

  // TODO: use a zip extractor when `ext === "zip"`
  await mkdirp(goDir);
  await new Promise((resolve, reject) => {
    res.body
      .on('error', reject)
      .pipe(tar.extract({ cwd: goDir, strip: 1 }))
      .on('error', reject)
      .on('finish', resolve);
  });
  return new GoWrapper(env, opts);
}

// type CreateGoOpts = {
//   workPath: string;
//   goPath: string;
//   platform?: string;
//   arch?: string;
//   opts?: execa.Options;
//   goMod?: boolean;
//   useSystemGo?: boolean;
// };

// export async function createGo({
//   workPath,
//   goPath,
//   platform = process.platform,
//   arch = process.arch,
//   opts = {},
//   goMod = false,
//   useSystemGo = false,
// }: CreateGoOpts) {
//   const env: { [key: string]: string } = {
//     ...process.env,
//     GOPATH: goPath,
//     ...opts.env,
//   };
//   if (!useSystemGo) {
//     const binPath = join(getGoDir(workPath), 'bin');
//     debug(`Adding ${binPath} to PATH`);
//     env.PATH = `${binPath}${delimiter}${env.PATH}`;
//   }
//   if (goMod) {
//     env.GO111MODULE = 'on';
//   }
//   await createGoPathTree(goPath, platform, arch);
//   return new GoWrapper(env, opts);
// }

// export async function downloadGo(workPath: string, modulePath: string) {
//   const dir = getGoDir(workPath);
//   const { platform, arch } = process;
//   let version = await parseGoVersion(modulePath);

//   if (!version) {
//     // we do *not* have a `go.mod` with a specific version to use, check the
//     // system if `go` is installed
//     const { failed, stdout } = await execa('go', ['version'], { reject: false });
//     if (!failed && parseInt(stdout.split('.')[1]) >= GO_MIN_VERSION) {
//       debug('Using system installed version of `go`: %o', stdout.trim());
//       return createGo({
//         arch,
//         goPath: dir,
//         platform,
//         useSystemGo: true,
//         workPath,
//       });
//     }

//     // default to newest (first)
//     version = Array.from(versionMap.values())[0];
//   }

//   debug(`Selected Go version ${version}`);

//   // Check `go` bin in cacheDir
//   const binDir = join(dir, 'bin');
//   const isGoExist = await pathExists(binDir);
//   if (isGoExist) {
//     // check if `go` has already been downloaded and that the version is correct
//     const { failed, stdout } = await execa('go', ['version'], {
//       env: {
//         ...process.env,
//         PATH: binDir
//       },
//       reject: false,
//     });
//     const [, fullVer, partialVer] = !failed && stdout.match(/((\d+\.\d+)\.\d+)/) || [];
//     if (!failed && (fullVer === version || partialVer === version)) {
//       debug('Using cached version of `go`: %o', stdout.trim());
//       return createGo({
//         arch,
//         goPath: dir,
//         platform,
//         workPath,
//       });
//     }
//   }

//   debug('Installing `go` v%s to %o for %s %s', version, dir, platform, arch);
//   const url = getGoUrl(version, platform, arch);
//   debug('Downloading `go` URL: %o', url);
//   const res = await fetch(url);

//   if (!res.ok) {
//     throw new Error(`Failed to download: ${url} (${res.status})`);
//   }

//   // TODO: use a zip extractor when `ext === "zip"`
//   await mkdirp(dir);
//   await new Promise((resolve, reject) => {
//     res.body
//       .on('error', reject)
//       .pipe(tar.extract({ cwd: dir, strip: 1 }))
//       .on('error', reject)
//       .on('finish', resolve);
//   });
//   return createGo({
//     arch,
//     goPath: dir,
//     platform,
//     workPath,
//   });
// }

async function parseGoVersion(modulePath: string): Promise<string | undefined> {
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
    if (err?.code === 'ENOENT') {
      debug(`File not found: ${file}`);
    } else {
      throw err;
    }
  }

  return version;
}
