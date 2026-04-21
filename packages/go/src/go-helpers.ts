import { createHash } from 'crypto';
import { extract } from 'tar';
import execa from 'execa';
import {
  createReadStream,
  mkdirp,
  pathExists,
  readFile,
  remove,
  symlink,
} from 'fs-extra';
import { delimiter, dirname, join } from 'path';
import stringArgv from 'string-argv';
import {
  cloneEnv,
  debug,
  extractZip,
  VerifiedDownloader,
} from '@vercel/build-utils';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { tmpdir } from 'os';
import XDGAppPaths from 'xdg-app-paths';
import type { Env } from '@vercel/build-utils';

const streamPipeline = promisify(pipeline);

/**
 * Pinned Go bootstrap release. The builder installs this version — with
 * SHA-256 verification — only when no compatible system Go is available. Once
 * a bootstrap (or a pre-installed Go) is on PATH, the Go command itself
 * handles toolchain resolution per the customer's `go.mod` via the standard
 * `GOTOOLCHAIN` mechanism (added in Go 1.21), using `sum.golang.org` for
 * integrity verification.
 */
const BOOTSTRAP_GO_VERSION = '1.23.12';

/**
 * Minimum Go minor version accepted from system/cache before we decide to
 * download the bootstrap. 1.21 is the earliest release that implements the
 * `GOTOOLCHAIN` resolution we rely on.
 */
const BOOTSTRAP_GO_MIN_MINOR = 21;

/**
 * SHA-256 of each platform's Go 1.23.12 archive, published at
 * https://go.dev/dl/?mode=json. Bumping {@link BOOTSTRAP_GO_VERSION} requires
 * refreshing every entry in this map.
 */
const BOOTSTRAP_GO_SHA256: Record<string, string> = {
  'linux-amd64':
    'd3847fef834e9db11bf64e3fb34db9c04db14e068eeb064f49af747010454f90',
  'linux-arm64':
    '52ce172f96e21da53b1ae9079808560d49b02ac86cecfa457217597f9bc28ab3',
  'darwin-amd64':
    '0f6efdc3ffc6f03b230016acca0aef43c229de022d0ff401e7aa4ad4862eca8e',
  'darwin-arm64':
    '5bfa117e401ae64e7ffb960243c448b535fe007e682a13ff6c7371f4a6f0ccaa',
  'windows-amd64':
    '07c35866cdd864b81bb6f1cfbf25ac7f87ddc3a976ede1bf5112acbb12dfe6dc',
};

/**
 * Minor-version allowlist used only by {@link parseGoModVersion} to resolve
 * minor-only `go 1.X` directives to a default patch release. Actual toolchain
 * selection at runtime is delegated to the Go command via `GOTOOLCHAIN`, so
 * keys that are absent here never prevent a user from pinning a specific
 * patch via `go X.Y.Z` or `toolchain goX.Y.Z`.
 */
const minorDefaultPatch = new Map<string, string>([
  ['1.26', '1.26.1'],
  ['1.25', '1.25.8'],
  ['1.24', '1.24.13'],
  ['1.23', '1.23.12'],
  ['1.22', '1.22.12'],
  ['1.21', '1.21.13'],
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
const GO_MIN_MAJOR_VERSION = 1;
const GO_MIN_MINOR_VERSION = 13;

/**
 * Determines the URL to download the bootstrap Golang SDK.
 */
function getGoUrl() {
  const { arch, platform } = process;
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const goPlatform = platformMap.get(platform) || platform;
  const goArch = archMap.get(arch) || arch;
  const filename = `go${BOOTSTRAP_GO_VERSION}.${goPlatform}-${goArch}.${ext}`;
  return {
    filename,
    url: `https://dl.google.com/go/${filename}`,
    platformKey: `${goPlatform}-${goArch}`,
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

type GoCommandError = Error & {
  all?: string;
  stderr?: string;
  stdout?: string;
};

function getGoCommandOutput(error: GoCommandError) {
  const stderr = error.stderr?.trim();
  const stdout = error.stdout?.trim();
  const all = error.all?.trim();

  if (stderr && stdout && stdout !== stderr) {
    return `stderr:\n${stderr}\n\nstdout:\n${stdout}`;
  }

  return stderr || stdout || all;
}

function enrichGoCommandError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  const output = getGoCommandOutput(error as GoCommandError);
  if (!output || error.message.includes(output)) {
    return error;
  }

  error.message = `${error.message}\n\n${output}`;
  return error;
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

  private async execute(...args: string[]) {
    const { opts, env } = this;
    debug(
      `Exec: go ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
    );
    debug(`  CWD=${opts.cwd}`);
    debug(`  GOROOT=${(env || opts.env).GOROOT}`);
    debug(`  GOTOOLCHAIN=${(env || opts.env).GOTOOLCHAIN}`);
    debug(`  GO_BUILD_FLAGS=${(env || opts.env).GO_BUILD_FLAGS}`);

    const captureAndForwardOutput =
      opts.stdio === undefined || opts.stdio === 'inherit';
    const subprocess = execa('go', args, {
      ...opts,
      env,
      stdio: captureAndForwardOutput ? 'pipe' : opts.stdio,
    });

    if (captureAndForwardOutput) {
      subprocess.stdout?.pipe(process.stdout);
      subprocess.stderr?.pipe(process.stderr);
    }

    try {
      return await subprocess;
    } catch (error) {
      throw enrichGoCommandError(error);
    }
  }

  mod({ tolerateErrors = false } = {}) {
    const args = ['mod', 'tidy'];
    if (tolerateErrors) {
      args.push('-e');
    }
    return this.execute(...args);
  }

  vendor() {
    return this.execute('mod', 'vendor');
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

  build(src: string | string[], dest: string, { vendorMode = false } = {}) {
    debug(`Building optimized 'go' binary ${src} -> ${dest}`);
    const sources = Array.isArray(src) ? src : [src];

    const envGoBuildFlags = (this.env || this.opts.env).GO_BUILD_FLAGS;
    const flags = envGoBuildFlags ? stringArgv(envGoBuildFlags) : [...GO_FLAGS];

    if (vendorMode && !envGoBuildFlags) {
      flags.push('-mod=vendor');
    }

    return this.execute('build', ...flags, '-o', dest, ...sources);
  }
}

type CreateGoOptions = {
  modulePath?: string;
  opts?: execa.Options;
  workPath: string;
};

/**
 * Computes the GOTOOLCHAIN value to export for a given parsed `go.mod`.
 *
 * The Go command (>= 1.21) resolves its own toolchain at runtime based on
 * `GOTOOLCHAIN`. When we pin an exact toolchain here, Go downloads and
 * verifies that exact version via `sum.golang.org` — guaranteeing fixtures
 * like `go 1.23.1` resolve to exactly `go1.23.1` regardless of which Go
 * binary initiated the build.
 *
 * Rules:
 *   - A `toolchain goX.Y.Z` directive always wins (explicit intent).
 *   - A patch-level `go X.Y.Z` directive with minor ≥ 1.21 forces that
 *     toolchain (toolchain modules exist only from 1.21 onwards).
 *   - Anything else (no go.mod, minor-only, or pre-1.21 pin) defers to
 *     `GOTOOLCHAIN=auto`, which lets Go use the running toolchain as long
 *     as it satisfies the `go` directive's minimum.
 */
export function decideGoToolchain(goMod: GoVersions | undefined): string {
  if (!goMod) return 'auto';
  if (goMod.toolchain) {
    return `go${goMod.toolchain}`;
  }
  const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(goMod.go);
  if (!m) return 'auto';
  const major = Number.parseInt(m[1], 10);
  const minor = Number.parseInt(m[2], 10);
  // Only treat a patch-level `go` directive as a toolchain pin when the minor
  // is ≥ 1.21 — earlier releases don't have toolchain modules, so asking Go
  // to fetch one would fail.
  if (major === 1 && minor >= 21) {
    return `go${goMod.go}`;
  }
  return 'auto';
}

/**
 * Initializes a `GoWrapper` instance.
 *
 * The builder delegates version resolution to Go's own toolchain mechanism:
 *   1. Probe the local cache, global cache, and system PATH for any Go
 *      binary that supports `GOTOOLCHAIN` (i.e. version ≥ 1.21).
 *   2. If none is available, install a pinned bootstrap (currently Go
 *      {@link BOOTSTRAP_GO_VERSION}) via {@link VerifiedDownloader} using
 *      the SHA-256 digest from {@link BOOTSTRAP_GO_SHA256}.
 *   3. Compute `GOTOOLCHAIN` via {@link decideGoToolchain} so Go itself
 *      fetches and verifies any customer-pinned toolchain via
 *      `sum.golang.org`.
 *
 * On Vercel's standard build container, Go will be pre-installed on PATH
 * once shipped; this probe finds it and skips the bootstrap download
 * entirely.
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
  // parse the `go.mod`, if exists, so we can compute GOTOOLCHAIN
  let goPreferredVersion: GoVersions | undefined;
  if (modulePath) {
    goPreferredVersion = await parseGoModVersionFromModule(modulePath);
  }

  const env = cloneEnv(process.env, opts.env);
  const { PATH } = env;
  const { platform } = process;
  const goGlobalCacheDir = join(
    goGlobalCachePath,
    `bootstrap-${BOOTSTRAP_GO_VERSION}_${platform}_${process.arch}`
  );
  const goCacheDir = join(workPath, localCacheDir);

  if (goPreferredVersion) {
    debug(
      `Preferred go version from go.mod: ${goPreferredVersion.toolchain ?? goPreferredVersion.go}`
    );
    env.GO111MODULE = 'on';
  }

  const setGoEnv = async (goDir: string | null) => {
    if (!goDir) {
      // Using system Go — leave GOROOT/PATH untouched and skip our cache
      // symlink wiring. The image's GOMODCACHE/GOCACHE (if set) are honored.
      env.GOROOT = undefined;
      env.PATH = PATH;
      return;
    }

    const isUnix = platform !== 'win32';

    const setEnvPaths = (modCache: string, buildCache: string) => {
      env.GOMODCACHE = modCache;
      env.GOCACHE = buildCache;
      debug(`Set GOMODCACHE to ${env.GOMODCACHE}`);
      debug(`Set GOCACHE to ${env.GOCACHE}`);
    };

    if (isUnix && goDir === goGlobalCacheDir) {
      // Using global cache → link it to goCacheDir
      debug(`Symlinking ${goDir} -> ${goCacheDir}`);
      await remove(goCacheDir);
      await mkdirp(dirname(goCacheDir));
      await symlink(goDir, goCacheDir);

      const modCache = join(goDir, 'pkg', 'mod');
      const buildCache = join(goDir, 'go-build');
      setEnvPaths(modCache, buildCache);

      goDir = goCacheDir;
    } else if (isUnix && goDir === goCacheDir) {
      // Using local cache → link temp writable directories
      // Use deterministic path based on workPath so all function builds
      // within the same deployment share the same cache paths
      const hash = createHash('md5').update(workPath).digest('hex').slice(0, 8);
      const tmpBase = join(tmpdir(), `vercel-go-cache-${hash}`);
      const tmpModCache = join(tmpBase, 'mod');
      const tmpBuildCache = join(tmpBase, 'go-build');

      await mkdirp(join(goDir, 'pkg', 'mod'));
      await mkdirp(join(goDir, 'go-build'));

      // Create symlinks (remove first to handle broken symlinks)
      await mkdirp(tmpBase);
      await remove(tmpModCache);
      await symlink(join(goCacheDir, 'pkg', 'mod'), tmpModCache);
      await remove(tmpBuildCache);
      await symlink(join(goCacheDir, 'go-build'), tmpBuildCache);

      setEnvPaths(tmpModCache, tmpBuildCache);
    }

    env.GOROOT = goDir;
    env.PATH = `${join(goDir, 'bin')}${delimiter}${PATH}`;
  };

  // Accept any Go ≥ 1.21 from local cache, global cache, or system PATH.
  const goDirs = {
    'local cache': goCacheDir,
    'global cache': goGlobalCacheDir,
    'system PATH': null as string | null,
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
      const { major, minor, version } = parseGoVersionString(stdout);

      if (major < 1 || (major === 1 && minor < BOOTSTRAP_GO_MIN_MINOR)) {
        debug(
          `Found go ${version} in ${label}, but < 1.${BOOTSTRAP_GO_MIN_MINOR} (GOTOOLCHAIN unsupported); trying next source`
        );
        continue;
      }

      debug(`Using go ${version} from ${label}`);
      await setGoEnv(goDir);
      applyGoToolchainEnv(env, goPreferredVersion);
      return new GoWrapper(env, opts);
    } catch {
      debug(`Go not found in ${label}`);
    }
  }

  // No compatible Go found — download the pinned bootstrap.
  await downloadBootstrap({ dest: goGlobalCacheDir });
  await setGoEnv(goGlobalCacheDir);
  applyGoToolchainEnv(env, goPreferredVersion);
  return new GoWrapper(env, opts);
}

function applyGoToolchainEnv(env: Env, goMod: GoVersions | undefined): void {
  env.GOTOOLCHAIN = decideGoToolchain(goMod);
  debug(`Set GOTOOLCHAIN to ${env.GOTOOLCHAIN}`);
}

/**
 * Downloads and installs the pinned bootstrap Go distribution with
 * SHA-256 verification.
 */
async function downloadBootstrap({ dest }: { dest: string }) {
  const { filename, url, platformKey } = getGoUrl();
  const sha256 = BOOTSTRAP_GO_SHA256[platformKey];
  if (!sha256) {
    throw new GoError(
      `No pinned bootstrap Go SHA-256 for ${platformKey}. ` +
        `Supported platforms: ${Object.keys(BOOTSTRAP_GO_SHA256).join(', ')}.`
    );
  }

  console.log(`Downloading Go bootstrap ${BOOTSTRAP_GO_VERSION}: ${url}`);

  const stagingDir = join(tmpdir(), `vercel-go-download-${process.pid}`);
  await mkdirp(stagingDir);
  const archivePath = join(stagingDir, filename);

  try {
    await new VerifiedDownloader({ sha256 }).downloadTo(url, archivePath);

    debug(`Installing Go ${BOOTSTRAP_GO_VERSION} to ${dest}`);

    await remove(dest);
    await mkdirp(dest);

    if (/\.zip$/.test(filename)) {
      await extractZip(archivePath, dest, { strip: 1 });
      return;
    }

    await streamPipeline(
      createReadStream(archivePath),
      extract({ cwd: dest, strip: 1 })
    );
  } finally {
    await remove(stagingDir);
  }
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

export interface GoVersions {
  go: string;
  toolchain?: string;
}

/**
 * Attempts to parse the preferred Go version from the `go.mod` file.
 *
 * @param modulePath The directory containing the `go.mod` file
 * @returns
 */
async function parseGoModVersionFromModule(
  modulePath: string
): Promise<GoVersions | undefined> {
  let version: GoVersions | undefined;
  const file = join(modulePath, 'go.mod');

  try {
    const content = await readFile(file, 'utf8');
    version = parseGoModVersion(content);
    if (!version) {
      console.log(`Warning: Unknown Go version in ${file}`);
    }
  } catch (err: any) {
    if (typeof err === 'object' && err.code === 'ENOENT') {
      debug(`File not found: ${file}`);
      return undefined;
    } else {
      throw err;
    }
  }

  return version;
}

/**
 * Attempts to parse the preferred Go version from the `go.mod` file.
 *
 * @param content The content of the `go.mod` file
 * @returns The version in { go: `${major}.${minor}.${patch}`, toolchain: `${major}.${minor}.${patch}` | undefined } format, or undefined if no version was found
 * @throws GoError If the go version is not supported
 */
export function parseGoModVersion(content: string): GoVersions | undefined {
  const goMatches = /^\s*go\s+(\d+)\.(\d+)(?:\.(\d+))?\s*(?:\/\/.*)?$/gm.exec(
    content
  );
  if (!goMatches) {
    return undefined;
  }
  const major = parseInt(goMatches[1], 10);
  const minor = parseInt(goMatches[2], 10);
  const patch = goMatches[3] && parseInt(goMatches[3], 10);
  // Accept stable `1.X[.Y]` versions and optional `rcN` / `betaN` pre-release
  // suffixes, matching the official Go toolchain version grammar. Anything
  // else (arbitrary suffixes like `_foo` or URL-unsafe characters) is rejected
  // so the resolved version cannot be attacker-shaped into a GOTOOLCHAIN
  // value that re-execs into a crafted path.
  const toolchainMatches =
    /^\s*toolchain\s+go((\d+)\.(\d+)(?:\.(\d+))?(?:rc\d+|beta\d+)?)\s*(?:\/\/.*)?$/gm.exec(
      content
    );
  const toolchain = toolchainMatches ? toolchainMatches[1] : undefined;
  if (major >= GO_MIN_MAJOR_VERSION && minor >= GO_MIN_MINOR_VERSION) {
    // Special case handle `patch` is provided and 0
    if (patch || patch === 0) {
      return {
        go: `${major}.${minor}.${patch}`,
        toolchain,
      };
    }
    const full = minorDefaultPatch.get(`${major}.${minor}`);
    if (full) {
      return {
        go: full,
        toolchain,
      };
    }
  }
  const err = new GoError(`Unsupported Go version ${major}.${minor}`);
  err.code = 'ERR_UNSUPPORTED_GO_VERSION';
  throw err;
}
