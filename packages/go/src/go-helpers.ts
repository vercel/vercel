import { createHash } from 'crypto';
import { extract } from 'tar';
import execa from 'execa';
import nodeFetch from 'node-fetch';
import {
  createWriteStream,
  mkdirp,
  pathExists,
  readFile,
  remove,
  symlink,
  copy,
} from 'fs-extra';
import fs from 'fs';
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'path';
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
  ['1.27', '1.27.1'],
  ['1.26', '1.26.8'],
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

// Written last so incomplete toolchain installs are not reused.
const GO_INSTALL_MARKER = '.vercel-go-install-complete';

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

  // Go 1.16 was the first version to support arm64, so if the version is younger
  // we need to download the amd64 version
  if (
    platform === 'darwin' &&
    goArch === 'arm64' &&
    parseInt((/^\d+.(\d+)/.exec(version) as string[])[1], 10) < 16
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

export interface GoModJson {
  Module?: { Path: string };
  Go?: string;
  Require?: Array<{ Path: string; Version: string; Indirect?: boolean }>;
  Replace?: Array<{
    Old: { Path: string; Version?: string };
    New: { Path: string; Version?: string };
  }>;
}

/** Where the selected Go version came from, for build log messages. */
export type GoVersionSource =
  | { kind: 'go.mod' | 'go.work'; file: string; directive: 'go' | 'toolchain' }
  | { kind: 'default' };

export class GoWrapper {
  private env: Env;
  private opts: execa.Options;
  readonly resolvedVersion: string;
  readonly versionSource: GoVersionSource;

  constructor(
    env: Env,
    opts: execa.Options = {},
    resolvedVersion: string,
    versionSource: GoVersionSource = { kind: 'default' }
  ) {
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }
    this.env = env;
    this.opts = opts;
    this.resolvedVersion = resolvedVersion;
    this.versionSource = versionSource;
  }

  private async execute(...args: string[]) {
    const { opts, env } = this;
    debug(
      `Exec: go ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
    );
    debug(`  CWD=${opts.cwd}`);
    debug(`  GOROOT=${(env || opts.env).GOROOT}`);
    debug(`  GO_BUILD_FLAGS=${(env || opts.env).GO_BUILD_FLAGS}`);

    const captureAndForwardOutput =
      opts.stdio === undefined || opts.stdio === 'inherit';
    const subprocess = execa('go', args, {
      ...opts,
      env,
      extendEnv: false,
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

  /**
   * Runs `go mod edit -json <path>` and returns the parsed structure.
   */
  async modEditJson(goModPath: string): Promise<GoModJson | null> {
    try {
      debug(`Exec: go mod edit -json ${goModPath}`);
      const result = await execa('go', ['mod', 'edit', '-json', goModPath], {
        ...this.opts,
        env: this.env,
        extendEnv: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      return JSON.parse(result.stdout) as GoModJson;
    } catch (err) {
      debug(`Failed to read go.mod for manifest: ${err}`);
      return null;
    }
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

  getEnv(): Env {
    return this.env;
  }

  build(
    src: string | string[],
    dest: string,
    { vendorMode = false, release = true } = {}
  ) {
    debug(
      `Building ${release ? 'optimized' : 'debug'} 'go' binary ${src} -> ${dest}`
    );
    const sources = Array.isArray(src) ? src : [src];

    const envGoBuildFlags = (this.env || this.opts.env).GO_BUILD_FLAGS;
    // `GO_FLAGS` strips symbols, which a deployed binary wants but dev does not.
    const defaultFlags = release ? GO_FLAGS : [];
    const flags = envGoBuildFlags
      ? stringArgv(envGoBuildFlags)
      : [...defaultFlags];

    if (vendorMode && !envGoBuildFlags) {
      flags.push('-mod=vendor');
    }

    return this.execute('build', ...flags, '-o', dest, ...sources);
  }
}

type CreateGoOptions = {
  /** Directory containing the `go.mod`, if any. */
  modulePath?: string;
  /** Active workspace file; its directives take precedence over `go.mod`. */
  workspaceFile?: string;
  opts?: execa.Options;
  workPath: string;
  /** Treat the `go` directive as a minimum, as upstream `go` does. */
  preferNewestToolchain?: boolean;
};

// `versionMap` is ordered newest-first.
export function newestSupportedGoVersion(): string {
  return Array.from(versionMap.values())[0];
}

/**
 * Searches within `stopDir`, from `startDir` through the boundary (inclusive).
 */
async function findFileInAncestors(
  startDir: string,
  stopDir: string,
  filename: string
): Promise<string | undefined> {
  let dir = resolve(startDir);
  const boundary = resolve(stopDir);
  const fromBoundary = relative(boundary, dir);
  if (
    fromBoundary === '..' ||
    fromBoundary.startsWith(`..${sep}`) ||
    isAbsolute(fromBoundary)
  ) {
    return undefined;
  }

  let reachedTop = false;
  while (!reachedTop) {
    const candidate = join(dir, filename);
    if (await pathExists(candidate)) {
      debug(`Found ${candidate}`);
      return candidate;
    }
    const parent = dirname(dir);
    reachedTop = relative(boundary, dir) === '' || parent === dir;
    dir = parent;
  }
  return undefined;
}

/** Finds the nearest `go.mod` up to `stopDir` (inclusive). */
export function findGoModPath(
  startDir: string,
  stopDir: string
): Promise<string | undefined> {
  return findFileInAncestors(startDir, stopDir, 'go.mod');
}

/**
 * Honors `GOWORK`, otherwise searches from the Go command's cwd through
 * `stopDir` (inclusive).
 */
export async function findGoWorkPath(
  startDir: string,
  stopDir: string,
  goWork?: string
): Promise<string | undefined> {
  if (goWork === 'off') return undefined;
  if (goWork && goWork !== 'auto') {
    if (!isAbsolute(goWork)) {
      throw new Error('GOWORK must be an absolute path');
    }
    return goWork;
  }
  return findFileInAncestors(startDir, stopDir, 'go.work');
}

function compareGoVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(part => parseInt(part, 10));
  const rightParts = right.split('.').map(part => parseInt(part, 10));

  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index++
  ) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/** An explicit `toolchain` directive always wins; `go` is a pin or a minimum. */
export function selectGoVersion(
  preferred: GoVersions | undefined,
  { preferNewestToolchain = false } = {}
): string {
  if (preferred?.toolchain) {
    return preferred.toolchain;
  }
  if (preferred && !preferNewestToolchain) {
    return preferred.go;
  }

  const newestSupported = newestSupportedGoVersion();
  if (preferred && compareGoVersions(preferred.go, newestSupported) > 0) {
    return preferred.go;
  }

  return newestSupported;
}

// Older Go builds binaries that abort at exec on recent macOS. Verified on
// 26.6 (arm64): 1.22.12 aborts, 1.23.12 runs.
const MIN_DARWIN_RUNNABLE_GO = { major: 1, minor: 23 };

export function isBelowMinDarwinRunnable(version: string): boolean {
  const [major, minor] = version.split('.').map(part => parseInt(part, 10));
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  if (major !== MIN_DARWIN_RUNNABLE_GO.major) {
    return major < MIN_DARWIN_RUNNABLE_GO.major;
  }
  return minor < MIN_DARWIN_RUNNABLE_GO.minor;
}

/**
 * Probes the binary on `env.PATH`; `GOTOOLCHAIN=local` prevents module or
 * workspace directives from switching toolchains during `go version`.
 */
export async function getInstalledGoVersion(env: Env) {
  const { stdout } = await execa('go', ['version'], {
    env: { ...env, GOTOOLCHAIN: 'local' },
    extendEnv: false,
  });
  return parseGoVersionString(stdout);
}

/** Prefers workspace directives over those in the module's `go.mod`. */
async function resolvePreferredGoVersion({
  modulePath,
  workspaceFile,
}: Pick<CreateGoOptions, 'modulePath' | 'workspaceFile'>): Promise<
  { versions: GoVersions; file: string; kind: 'go.mod' | 'go.work' } | undefined
> {
  if (workspaceFile) {
    const versions = await parseGoVersionFile(workspaceFile);
    if (versions) {
      return { versions, file: workspaceFile, kind: 'go.work' };
    }
  }
  if (modulePath) {
    const file = join(modulePath, 'go.mod');
    const versions = await parseGoVersionFile(file);
    if (versions) {
      return { versions, file, kind: 'go.mod' };
    }
  }
  return undefined;
}

/**
 * Creates a wrapper for the selected Go version, checking the local cache,
 * global cache, then PATH before downloading to the global cache.
 */
export async function createGo({
  modulePath,
  workspaceFile,
  opts = {},
  workPath,
  preferNewestToolchain = false,
}: CreateGoOptions): Promise<GoWrapper> {
  const preferred = await resolvePreferredGoVersion({
    modulePath,
    workspaceFile,
  });
  const goPreferredVersion = preferred?.versions;

  const goSelectedVersion = selectGoVersion(goPreferredVersion, {
    preferNewestToolchain,
  });

  let versionSource: GoVersionSource = { kind: 'default' };
  if (preferred && preferred.versions.toolchain === goSelectedVersion) {
    const { kind, file } = preferred;
    versionSource = { kind, file, directive: 'toolchain' };
  } else if (preferred && preferred.versions.go === goSelectedVersion) {
    const { kind, file } = preferred;
    versionSource = { kind, file, directive: 'go' };
  }

  if (
    preferNewestToolchain &&
    process.platform === 'darwin' &&
    isBelowMinDarwinRunnable(goSelectedVersion)
  ) {
    console.warn(
      `Warning: your \`${preferred?.kind ?? 'go.mod'}\` pins Go ${goSelectedVersion} via \`toolchain\`. Binaries built ` +
        `with Go older than ${MIN_DARWIN_RUNNABLE_GO.major}.${MIN_DARWIN_RUNNABLE_GO.minor} do not start on recent macOS. ` +
        `Remove the directive to use Go ${newestSupportedGoVersion()} locally.`
    );
  }

  const env = opts.env ? cloneEnv(opts.env) : cloneEnv(process.env);
  const { PATH } = env;
  const { platform } = process;
  const goGlobalCacheDir = join(
    goGlobalCachePath,
    `${goSelectedVersion}_${platform}_${process.arch}`
  );
  const goCacheDir = join(workPath, localCacheDir);

  if (preferred) {
    debug(`Preferred go version ${goSelectedVersion} (from ${preferred.file})`);
    env.GO111MODULE = 'on';
  } else {
    debug(
      `Preferred go version ${goSelectedVersion} (latest from version map)`
    );
  }

  const setGoEnv = async (goDir: string | null) => {
    if (!goDir) {
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

  // try each of these Go directories looking for the version we need
  const goDirs = {
    'local cache': goCacheDir,
    'global cache': goGlobalCacheDir,
    'system PATH': null,
  };

  for (const [label, goDir] of Object.entries(goDirs)) {
    try {
      const goBinDir = goDir && join(goDir, 'bin');
      if (goBinDir) {
        if (!(await pathExists(goBinDir))) {
          debug(`Go not found in ${label}`);
          continue;
        }
        if (!(await pathExists(join(goDir, GO_INSTALL_MARKER)))) {
          debug(
            `Go install in ${label} is incomplete, ignoring this installation`
          );
          continue;
        }
      }

      env.GOROOT = goDir || undefined;
      env.PATH = goBinDir || PATH;

      const { major, minor, short, version } = await getInstalledGoVersion(env);

      if (
        major < GO_MIN_MAJOR_VERSION ||
        (major === GO_MIN_MAJOR_VERSION && minor < GO_MIN_MINOR_VERSION)
      ) {
        debug(`Found go ${version} in ${label}, but version is unsupported`);
      }
      if (version === goSelectedVersion || short === goSelectedVersion) {
        debug(`Selected go ${version} (from ${label})`);

        await setGoEnv(goDir);
        return new GoWrapper(env, opts, version, versionSource);
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
  return new GoWrapper(env, opts, goSelectedVersion, versionSource);
}

/**
 * Extracts Go into a private sibling directory, then renames it into `dest`.
 */
async function download({ dest, version }: { dest: string; version: string }) {
  const { filename, url } = getGoUrl(version);
  console.log(`Downloading go: ${url}`);
  const res = await nodeFetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download: ${url} (${res.status})`);
  }

  const tmpSuffix = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  const tmpDest = `${dest}.tmp-${tmpSuffix}`;
  debug(`Installing go ${version} to ${dest} (via ${tmpDest})`);

  await mkdirp(tmpDest);
  try {
    if (/\.zip$/.test(filename)) {
      const zipFile = join(tmpdir(), `${tmpSuffix}-${filename}`);
      try {
        await streamPipeline(res.body, createWriteStream(zipFile));
        const zip = await yauzl.open(zipFile);
        let entry = await zip.readEntry();
        while (entry) {
          const fileName = entry.fileName.split('/').slice(1).join('/');

          if (fileName) {
            const destPath = join(tmpDest, fileName);

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
    } else {
      await new Promise((resolve, reject) => {
        res.body
          .on('error', reject)
          .pipe(extract({ cwd: tmpDest, strip: 1 }))
          .on('error', reject)
          .on('finish', resolve);
      });
    }

    await fs.promises.writeFile(join(tmpDest, GO_INSTALL_MARKER), version);

    // Remove an incomplete install before renaming the completed tree into place.
    if (!(await pathExists(join(dest, GO_INSTALL_MARKER)))) {
      await remove(dest);
    }
    try {
      await fs.promises.rename(tmpDest, dest);
    } catch (err) {
      // Reuse a completed installation if another build won the rename.
      if (!(await pathExists(join(dest, GO_INSTALL_MARKER)))) {
        throw err;
      }
    }
  } finally {
    await remove(tmpDest);
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

interface GoVersions {
  go: string;
  toolchain?: string;
}

/**
 * Reads `go` and `toolchain` directives from `go.mod` or `go.work`.
 * Returns `undefined` if the file or `go` directive is missing.
 */
async function parseGoVersionFile(
  file: string
): Promise<GoVersions | undefined> {
  let version: GoVersions | undefined;

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
 * Checks if a file is an ELF binary by reading the 4-byte magic header.
 */
export async function isElfBinary(filePath: string): Promise<boolean> {
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buf = new Uint8Array(4);
    await fd.read(buf, 0, 4, 0);
    // ELF magic: 0x7F 'E' 'L' 'F'
    return (
      buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46
    );
  } finally {
    await fd.close();
  }
}

/**
 * Extracts the module name's last path segment from a go.mod file.
 * e.g. "github.com/user/myapp" -> "myapp"
 */
export async function getGoModuleName(
  goModPath: string
): Promise<string | undefined> {
  try {
    const content = await readFile(goModPath, 'utf8');
    const match = content.match(/^\s*module\s+(.+)$/m);
    if (match) {
      const modulePath = match[1].trim();
      return basename(modulePath);
    }
  } catch {
    // go.mod not readable
  }
  return undefined;
}

/**
 * Discovers the compiled Go binary after a custom buildCommand.
 *
 * Priority:
 *  1. User wrote directly to `destPath` (via $VERCEL_OUTPUT_FILE)
 *  2. Well-known binary names in workPath (with ELF + mtime check)
 *  3. Scan workPath top-level for new ELF binaries (mtime check)
 *  4. Scan workPath/bin/ for new ELF binaries (mtime check)
 */
export async function findGoBinary(
  workPath: string,
  destPath: string,
  goModPath: string | undefined,
  buildStartTime: number
): Promise<void> {
  if (await pathExists(destPath)) {
    return;
  }

  const moduleName = goModPath ? await getGoModuleName(goModPath) : undefined;

  const candidates = [moduleName, 'server', 'app', 'main', 'api'].filter(
    (c): c is string => Boolean(c)
  );

  for (const name of candidates) {
    const p = join(workPath, name);
    if (await pathExists(p)) {
      const stat = await fs.promises.stat(p);
      if (
        stat.isFile() &&
        stat.mtimeMs >= buildStartTime &&
        (await isElfBinary(p))
      ) {
        debug(`Found Go binary: ${name}`);
        await copy(p, destPath);
        return;
      }
    }
  }

  const found: string[] = [];

  // Scan top-level workPath
  const entries = await fs.promises.readdir(workPath);
  for (const entry of entries) {
    if (candidates.includes(entry)) continue;
    const p = join(workPath, entry);
    const stat = await fs.promises.stat(p);
    if (
      stat.isFile() &&
      stat.mtimeMs >= buildStartTime &&
      (await isElfBinary(p))
    ) {
      found.push(entry);
    }
  }

  // Scan bin/ subdirectory
  const binDir = join(workPath, 'bin');
  if (await pathExists(binDir)) {
    const binEntries = await fs.promises.readdir(binDir);
    for (const entry of binEntries) {
      const p = join(binDir, entry);
      const stat = await fs.promises.stat(p);
      if (
        stat.isFile() &&
        stat.mtimeMs >= buildStartTime &&
        (await isElfBinary(p))
      ) {
        found.push(join('bin', entry));
      }
    }
  }

  if (found.length === 1) {
    debug(`Found Go binary: ${found[0]}`);
    await copy(join(workPath, found[0]), destPath);
    return;
  }

  if (found.length > 1) {
    throw new Error(
      `Found multiple ELF binaries after buildCommand: ${found.join(', ')}. ` +
        'Use `go build -o $VERCEL_OUTPUT_FILE` to specify which binary to deploy.'
    );
  }

  throw new Error(
    'No compiled Go binary found after buildCommand. ' +
      'Ensure your command produces a Linux binary (GOOS=linux is set), ' +
      'or use `go build -o $VERCEL_OUTPUT_FILE`.'
  );
}

/**
 * Parses `go` and `toolchain` directives from `go.mod` or `go.work` content.
 * Returns `undefined` without a `go` directive; throws for unsupported versions.
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
  const toolchainMatches =
    /^\s*toolchain\s+go((\d+)\.(\d+)(?:\.(\d+)|\w+\d+)?)\s*(?:\/\/.*)?$/gm.exec(
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
    const full = versionMap.get(`${major}.${minor}`);
    if (full) {
      return {
        go: full,
        toolchain,
      };
    }
    // Map future `go 1.N` directives to their first release, `1.N.0`.
    if (
      major === GO_MIN_MAJOR_VERSION &&
      compareGoVersions(`${major}.${minor}`, newestSupportedGoVersion()) > 0
    ) {
      return {
        go: `${major}.${minor}.0`,
        toolchain,
      };
    }
  }
  const err = new GoError(`Unsupported Go version ${major}.${minor}`);
  err.code = 'ERR_UNSUPPORTED_GO_VERSION';
  throw err;
}
