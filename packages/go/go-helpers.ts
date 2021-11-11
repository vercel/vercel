import tar from 'tar';
import execa from 'execa';
import fetch from 'node-fetch';
import { mkdirp, pathExists, readFile } from 'fs-extra';
import { join } from 'path';
import stringArgv from 'string-argv';
import { debug } from '@vercel/build-utils';
const versionMap = new Map([
  ['1.17', '1.17.3'],
  ['1.16', '1.16.10'],
  ['1.15', '1.15.8'],
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
  debug('Analyzing entrypoint %o with modulePath %o', filePath, modulePath);
  const bin = join(__dirname, `analyze${OUT_EXTENSION}`);

  const isAnalyzeExist = await pathExists(bin);
  if (!isAnalyzeExist) {
    const src = join(__dirname, 'util', 'analyze.go');
    const go = await downloadGo(workPath, modulePath);
    await go.build(src, bin);
  }

  const args = [`-modpath=${modulePath}`, filePath];

  const analyzed = await execa.stdout(bin, args);
  debug('Analyzed entrypoint %o', analyzed);
  return analyzed;
}

// Creates a `$GOPATH` directory tree, as per `go help gopath` instructions.
// Without this, `go` won't recognize the `$GOPATH`.
function createGoPathTree(goPath: string, platform: string, arch: string) {
  const tuple = `${getPlatform(platform)}_${getArch(arch)}`;
  debug('Creating GOPATH directory structure for %o (%s)', goPath, tuple);
  return Promise.all([
    mkdirp(join(goPath, 'bin')),
    mkdirp(join(goPath, 'pkg', tuple)),
  ]);
}

class GoWrapper {
  private env: { [key: string]: string };
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
    debug('Exec %o', `go ${args.join(' ')}`);
    return execa('go', args, { stdio: 'pipe', ...opts, env });
  }

  mod() {
    return this.execute('mod', 'tidy');
  }

  get(src?: string) {
    const args = ['get'];
    if (src) {
      debug('Fetching `go` dependencies for file %o', src);
      args.push(src);
    } else {
      debug('Fetching `go` dependencies for cwd %o', this.opts.cwd);
    }
    return this.execute(...args);
  }

  build(src: string | string[], dest: string) {
    debug('Building optimized `go` binary %o -> %o', src, dest);
    const sources = Array.isArray(src) ? src : [src];

    const flags = process.env.GO_BUILD_FLAGS
      ? stringArgv(process.env.GO_BUILD_FLAGS)
      : GO_FLAGS;

    return this.execute('build', ...flags, '-o', dest, ...sources);
  }
}

export async function createGo(
  workPath: string,
  goPath: string,
  platform = process.platform,
  arch = process.arch,
  opts: execa.Options = {},
  goMod = false
) {
  const binPath = join(getGoDir(workPath), 'bin');
  debug(`Adding ${binPath} to PATH`);
  const path = `${binPath}:${process.env.PATH}`;
  const env: { [key: string]: string } = {
    ...process.env,
    PATH: path,
    GOPATH: goPath,
    ...opts.env,
  };
  if (goMod) {
    env.GO111MODULE = 'on';
  }
  await createGoPathTree(goPath, platform, arch);
  return new GoWrapper(env, opts);
}

export async function downloadGo(workPath: string, modulePath: string) {
  const dir = getGoDir(workPath);
  const { platform, arch } = process;
  const version = await parseGoVersion(modulePath);

  // Check if `go` is already installed in user's `$PATH`
  const { failed, stdout } = await execa('go', ['version'], { reject: false });

  if (!failed && parseInt(stdout.split('.')[1]) >= GO_MIN_VERSION) {
    debug('Using system installed version of `go`: %o', stdout.trim());
    return createGo(workPath, dir, platform, arch);
  }

  // Check `go` bin in cacheDir
  const isGoExist = await pathExists(join(dir, 'bin'));
  if (!isGoExist) {
    debug('Installing `go` v%s to %o for %s %s', version, dir, platform, arch);
    const url = getGoUrl(version, platform, arch);
    debug('Downloading `go` URL: %o', url);
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Failed to download: ${url} (${res.status})`);
    }

    // TODO: use a zip extractor when `ext === "zip"`
    await mkdirp(dir);
    await new Promise((resolve, reject) => {
      res.body
        .on('error', reject)
        .pipe(tar.extract({ cwd: dir, strip: 1 }))
        .on('error', reject)
        .on('finish', resolve);
    });
  }
  return createGo(workPath, dir, platform, arch);
}

async function parseGoVersion(modulePath: string): Promise<string> {
  // default to newest (first)
  let version = Array.from(versionMap.values())[0];
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
  } catch (err) {
    if (err.code === 'ENOENT') {
      debug(`File not found: ${file}`);
    } else {
      throw err;
    }
  }

  debug(`Selected Go version ${version}`);
  return version;
}
