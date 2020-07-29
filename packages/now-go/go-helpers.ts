import tar from 'tar';
import execa from 'execa';
import fetch from 'node-fetch';
import { mkdirp, pathExists } from 'fs-extra';
import { dirname, join } from 'path';
import buildUtils from './build-utils';
import stringArgv from 'string-argv';
const { debug } = buildUtils;
const archMap = new Map([['x64', 'amd64'], ['x86', '386']]);
const platformMap = new Map([['win32', 'windows']]);

// Location where the `go` binary will be installed after `postinstall`
const GO_DIR = join(__dirname, 'go');
const GO_BIN = join(GO_DIR, 'bin', 'go');
const GO_FLAGS = process.platform === 'win32' ? [] : ['-ldflags', '-s -w'];

const getPlatform = (p: string) => platformMap.get(p) || p;
const getArch = (a: string) => archMap.get(a) || a;
const getGoUrl = (version: string, platform: string, arch: string) => {
  const goArch = getArch(arch);
  const goPlatform = getPlatform(platform);
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  return `https://dl.google.com/go/go${version}.${goPlatform}-${goArch}.${ext}`;
};

export const OUT_EXTENSION = process.platform === 'win32' ? '.exe' : '';

export async function getAnalyzedEntrypoint(filePath: string, modulePath = '') {
  debug('Analyzing entrypoint %o', filePath);
  const bin = join(__dirname, `analyze${OUT_EXTENSION}`);

  const isAnalyzeExist = await pathExists(bin);
  if (!isAnalyzeExist) {
    const src = join(__dirname, 'util', 'analyze.go');
    const go = await downloadGo();
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
  goPath: string,
  platform = process.platform,
  arch = process.arch,
  opts: execa.Options = {},
  goMod = false
) {
  const path = `${dirname(GO_BIN)}:${process.env.PATH}`;
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

export async function downloadGo(
  dir = GO_DIR,
  version = '1.13.7',
  platform = process.platform,
  arch = process.arch
) {
  // Check if `go` is already installed in user's `$PATH`
  const { failed, stdout } = await execa('go', ['version'], { reject: false });

  if (!failed && parseInt(stdout.split('.')[1]) >= 11) {
    debug('Using system installed version of `go`: %o', stdout.trim());
    return createGo(dir, platform, arch);
  }

  // Check `go` bin in builder CWD
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
  return createGo(dir, platform, arch);
}
