import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { delimiter as pathDelimiter } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import execa from 'execa';
import fs from 'fs';
import os from 'os';
import which from 'which';
import { debug, NowBuildError } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';

export const UV_VERSION = '0.10.11';
export const UV_PYTHON_PATH_PREFIX = '/uv/python/';
export const UV_PYTHON_DOWNLOADS_MODE = 'automatic';
export const UV_CACHE_DIR_SUBPATH = ['.vercel', 'python', 'cache', 'uv'];

// SHA-256 checksum for the Linux x86_64 uv tarball.  Update with UV_VERSION.
export const UV_BINARY_CHECKSUM =
  '5a360b0de092ddf4131f5313d0411b48c4e95e8107e40c3f8f2e9fcb636b3583';

const isWin = process.platform === 'win32';
const uvExec = isWin ? 'uv.exe' : 'uv';

interface UvPythonEntry {
  version_parts: {
    major: number;
    minor: number;
  };
  path: string | null;
  implementation: string;
}

const KNOWN_UV_PATH = '/usr/local/bin/uv';

/**
 * On the Vercel build image, return the known uv path directly instead of
 * scanning PATH via `which`.
 */
export function findUvOnBuildImage(
  knownPath: string = KNOWN_UV_PATH
): string | null {
  if (!process.env.VERCEL_BUILD_IMAGE) return null;
  return fs.existsSync(knownPath) ? knownPath : null;
}

export function findUvInPath(): string | null {
  return findUvOnBuildImage() ?? which.sync('uv', { nothrow: true });
}

export function getUvCacheDir(workPath: string): string {
  return join(workPath, ...UV_CACHE_DIR_SUBPATH);
}

export class UvRunner {
  private uvPath: string;
  private uvCacheDir?: string;

  constructor(uvPath: string, uvCacheDir?: string) {
    this.uvPath = uvPath;
    this.uvCacheDir = uvCacheDir;
  }

  getPath(): string {
    return this.uvPath;
  }

  /**
   * List installed Python versions managed by uv.
   * Excludes system Python.
   */
  listInstalledPythons(): Set<string> {
    let output: string;
    try {
      output = execFileSync(
        this.uvPath,
        ['python', 'list', '--only-installed', '--output-format', 'json'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch (err) {
      throw new Error(
        `Failed to run 'uv python list': ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!output || output.trim() === '' || output.trim() === '[]') {
      return new Set();
    }

    let pyList: UvPythonEntry[];
    try {
      pyList = JSON.parse(output);
    } catch (err) {
      throw new Error(
        `Failed to parse 'uv python list' output: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Only apply the startsWith filter when in Vercel Build Image
    // (local builds use system Python paths, not /uv/python/)
    if (process.env.VERCEL_BUILD_IMAGE) {
      pyList = pyList.filter(
        entry =>
          entry.path !== null &&
          entry.path.startsWith(UV_PYTHON_PATH_PREFIX) &&
          entry.implementation === 'cpython'
      );
    } else {
      pyList = pyList.filter(
        entry => entry.path !== null && entry.implementation === 'cpython'
      );
    }

    return new Set(
      pyList.map(
        entry => `${entry.version_parts.major}.${entry.version_parts.minor}`
      )
    );
  }

  async sync(options: {
    venvPath: string;
    projectDir: string;
    locked?: boolean;
    frozen?: boolean;
    noBuild?: boolean;
    noInstallProject?: boolean;
    pythonPlatform?: string;
  }): Promise<void> {
    const {
      venvPath,
      projectDir,
      locked,
      frozen,
      noBuild,
      noInstallProject,
      pythonPlatform,
    } = options;
    const args = ['sync', '--active', '--no-dev', '--link-mode', 'hardlink'];
    if (frozen) {
      args.push('--frozen');
    } else if (locked) {
      args.push('--locked');
    }
    if (noBuild) {
      args.push('--no-build');
    }
    if (noInstallProject) {
      args.push('--no-install-project');
    }
    if (pythonPlatform) {
      args.push('--python-platform', pythonPlatform);
    }
    args.push('--no-editable');
    await this.runUvCmd(args, projectDir, venvPath);
  }

  async lock(options: {
    projectDir: string;
    venvPath: string;
    noBuild?: boolean;
    upgrade?: boolean;
  }): Promise<void> {
    const { projectDir, venvPath, noBuild, upgrade } = options;
    const args = ['lock', '--python', getVenvPythonBin(venvPath)];
    if (noBuild) {
      args.push('--no-build');
    }
    if (upgrade) {
      args.push('--upgrade');
    }
    await this.runUvCmd(args, projectDir, venvPath);
  }

  async addDependencies(options: {
    venvPath: string;
    projectDir: string;
    dependencies: string[];
  }): Promise<void> {
    const { venvPath, projectDir, dependencies } = options;
    const toAdd = dependencies.filter(Boolean);
    if (!toAdd.length) return;

    const args = ['add', '--active', ...toAdd];
    debug(`Running "uv ${args.join(' ')}" in ${projectDir}...`);
    await this.runUvCmd(args, projectDir, venvPath);
  }

  async addFromFile(options: {
    venvPath: string;
    projectDir: string;
    requirementsPath: string;
  }): Promise<void> {
    const { venvPath, projectDir, requirementsPath } = options;
    const args = ['add', '--active', '-r', requirementsPath];
    debug(`Running "uv ${args.join(' ')}" in ${projectDir}...`);
    await this.runUvCmd(args, projectDir, venvPath);
  }

  /**
   * Run a `uv pip` command (e.g., `uv pip install`).
   */
  async pip(options: {
    venvPath: string;
    projectDir: string;
    args: string[];
  }): Promise<void> {
    const { venvPath, projectDir, args } = options;
    const fullArgs = ['pip', ...args];
    await this.runUvCmd(fullArgs, projectDir, venvPath);
  }

  /**
   * Prune the uv cache for CI: removes pre-built wheels and unzipped source
   * distributions while retaining source-built wheels.
   */
  async cachePrune(): Promise<void> {
    const args = ['cache', 'prune', '--ci'];
    const pretty = `uv ${args.join(' ')}`;
    debug(`Running "${pretty}"...`);
    try {
      await execa(this.uvPath, args, {
        env: getProtectedUvEnv(process.env, this.uvCacheDir),
      });
    } catch (err) {
      // Cache pruning is best-effort; log but don't fail the build.
      debug(
        `Warning: ${pretty} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async runUvCmd(
    args: string[],
    cwd: string,
    venvPath: string
  ): Promise<void> {
    const pretty = `uv ${args.join(' ')}`;
    debug(`Running "${pretty}"...`);

    try {
      await execa(this.uvPath, args, {
        cwd,
        env: this.getVenvEnv(venvPath),
      });
    } catch (err) {
      const error: Error & { code?: unknown } = new Error(
        `Failed to run "${pretty}": ${err instanceof Error ? err.message : String(err)}`
      );
      // retain code/signal to ensure it's treated as a build error
      if (err && typeof err === 'object') {
        if ('code' in err) {
          error.code = (err as { code: number | string }).code;
        } else if ('signal' in err) {
          error.code = (err as { signal: string }).signal;
        }
      }

      throw error;
    }
  }

  private getVenvEnv(venvPath: string): NodeJS.ProcessEnv {
    const binDir = isWin ? join(venvPath, 'Scripts') : join(venvPath, 'bin');
    const existingPath = process.env.PATH || '';

    return {
      ...getProtectedUvEnv(process.env, this.uvCacheDir),
      VIRTUAL_ENV: venvPath,
      PATH: existingPath ? `${binDir}${pathDelimiter}${existingPath}` : binDir,
    };
  }
}

async function getGlobalScriptsDir(pythonPath: string): Promise<string | null> {
  const code = `import sysconfig; print(sysconfig.get_path('scripts'))`;
  try {
    const { stdout } = await execa(pythonPath, ['-c', code]);
    const out = stdout.trim();
    return out || null;
  } catch (err) {
    debug('Failed to resolve Python global scripts directory', err);
    return null;
  }
}

async function getUserScriptsDir(pythonPath: string): Promise<string | null> {
  const code =
    `import sys, sysconfig; print(sysconfig.get_path('scripts', scheme=('nt_user' if sys.platform == 'win32' else 'posix_user')))`.replace(
      /\n/g,
      ' '
    );
  try {
    const { stdout } = await execa(pythonPath, ['-c', code]);
    const out = stdout.trim();
    return out || null;
  } catch (err) {
    debug('Failed to resolve Python user scripts directory', err);
    return null;
  }
}

export async function findUvBinary(pythonPath: string): Promise<string | null> {
  const buildImageUv = findUvOnBuildImage();
  if (buildImageUv) return buildImageUv;

  const found = which.sync('uv', { nothrow: true });
  if (found) return found;

  try {
    const globalScriptsDir = await getGlobalScriptsDir(pythonPath);
    if (globalScriptsDir) {
      const uvPath = join(globalScriptsDir, uvExec);
      if (fs.existsSync(uvPath)) return uvPath;
    }
  } catch (err) {
    debug('Failed to resolve Python global scripts directory', err);
  }

  try {
    const userScriptsDir = await getUserScriptsDir(pythonPath);
    if (userScriptsDir) {
      const uvPath = join(userScriptsDir, uvExec);
      if (fs.existsSync(uvPath)) return uvPath;
    }
  } catch (err) {
    debug('Failed to resolve Python user scripts directory', err);
  }

  try {
    const candidates: string[] = [];
    if (!isWin) {
      candidates.push(join(os.homedir(), '.local', 'bin', 'uv'));
      candidates.push('/usr/local/bin/uv');
      candidates.push('/opt/homebrew/bin/uv');
    } else {
      candidates.push('C:\\Users\\Public\\uv\\uv.exe');
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } catch (err) {
    debug('Failed to resolve uv fallback paths', err);
  }

  return null;
}

export async function getUvBinaryOrInstall(
  pythonPath: string
): Promise<string> {
  const uvBin = await findUvBinary(pythonPath);
  if (uvBin) return uvBin;

  // Pip install uv
  // Note we're using pip directly instead of pipPath because we want to make sure
  // it is installed in the same environment as the Python interpreter
  try {
    console.log('Installing uv...');
    await execa(
      pythonPath,
      [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--no-cache-dir',
        '--user',
        `uv==${UV_VERSION}`,
      ],
      { env: { ...process.env, PIP_USER: '1' } }
    );
  } catch (err) {
    throw new Error(
      `Failed to install uv via pip: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const resolvedUvBin = await findUvBinary(pythonPath);
  if (!resolvedUvBin) {
    throw new Error('Unable to resolve uv binary after pip install');
  }

  console.log(`Installed uv at "${resolvedUvBin}"`);
  return resolvedUvBin;
}

export function filterUnsafeUvPipArgs(args: string[]): string[] {
  // `--no-warn-script-location` is not supported/safe with `uv pip install`,
  // so strip it out when using uv while still allowing it for plain pip.
  return args.filter(arg => arg !== '--no-warn-script-location');
}

export function getProtectedUvEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  uvCacheDir?: string
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    UV_PYTHON_DOWNLOADS: UV_PYTHON_DOWNLOADS_MODE,
  };
  if (uvCacheDir) {
    env.UV_CACHE_DIR = uvCacheDir;
  }
  return env;
}

/**
 * Directory name where the uv binary will be bundled in the Lambda package.
 * This is used for runtime dependency installation.
 */
export const UV_BUNDLE_DIR = '_uv';

/**
 * Get the path to the uv binary for bundling into the Lambda package.
 * Uses `which` to find uv in PATH, or falls back to known locations.
 *
 * @param pythonPath Path to Python interpreter (used for fallback resolution)
 * @returns Path to the uv binary
 * @throws Error if uv binary cannot be found
 */
export async function getUvBinaryForBundling(
  pythonPath: string
): Promise<string> {
  const uvPath = await findUvBinary(pythonPath);
  if (!uvPath) {
    throw new Error(
      'Cannot find uv binary for bundling. ' +
        'Ensure uv is installed and available in PATH.'
    );
  }

  // Resolve symlinks to get the actual binary path.
  // This is important because in Vercel's build container,
  // /usr/local/bin/uv is a symlink to /uv/uv. If we don't resolve it,
  // the Lambda will contain a symlink rather than the actual binary.
  const resolvedPath = await fs.promises.realpath(uvPath);
  return resolvedPath;
}

const UV_LINUX_TARGET = 'x86_64-unknown-linux-gnu';

/**
 * Download the Linux x86_64 uv binary for bundling into the Lambda.
 *
 * Cached at `{cacheDir}/uv-{UV_VERSION}-{target}/uv`.  The tarball's
 * SHA-256 is verified against {@link UV_BINARY_CHECKSUM}.
 */
export async function downloadUvBinaryForTarget(
  cacheDir: string
): Promise<string> {
  const destDir = join(cacheDir, `uv-${UV_VERSION}-${UV_LINUX_TARGET}`);
  const destBinary = join(destDir, 'uv');

  // Return cached binary if it exists and is executable.
  try {
    await fs.promises.access(destBinary, fs.constants.X_OK);
    debug(`Using cached uv binary at ${destBinary}`);
    return destBinary;
  } catch {
    // Not cached -- continue to download.
  }

  const tarballName = `uv-${UV_LINUX_TARGET}.tar.gz`;
  const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${tarballName}`;

  debug(`Downloading uv ${UV_VERSION} from ${url}`);
  console.log(
    `Downloading uv ${UV_VERSION} (linux x86_64) for runtime dependency installation...`
  );

  await fs.promises.mkdir(destDir, { recursive: true });
  const tarballPath = join(destDir, tarballName);

  await downloadUvTarball(url, tarballPath);

  const actualHash = await sha256File(tarballPath);
  if (actualHash !== UV_BINARY_CHECKSUM) {
    await fs.promises.unlink(tarballPath).catch(() => {});
    throw new NowBuildError({
      code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
      message:
        `checksum mismatch for ${tarballName}: ` +
        `expected ${UV_BINARY_CHECKSUM}, got ${actualHash}`,
    });
  }

  // Archive contains `uv-{target}/uv` (and uvx).
  try {
    await execa('tar', [
      'xzf',
      tarballPath,
      '--strip-components=1',
      '-C',
      destDir,
    ]);
  } catch (err) {
    throw new NowBuildError({
      code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
      message: `could not extract ${tarballName}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  await fs.promises.chmod(destBinary, 0o755);
  await fs.promises.unlink(tarballPath).catch(() => {});

  debug(`Downloaded uv binary to ${destBinary}`);
  return destBinary;
}

async function downloadUvTarball(url: string, dest: string): Promise<void> {
  const tmpDest = `${dest}.${process.pid}.${Date.now()}.tmp`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new NowBuildError({
        code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
        message: `could not download ${url}: HTTP ${response.status}`,
      });
    }

    if (!response.body) {
      throw new NowBuildError({
        code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
        message: `could not download ${url}: response body was empty`,
      });
    }

    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(tmpDest)
    );
    await fs.promises.rename(tmpDest, dest);
  } catch (err) {
    await fs.promises.unlink(tmpDest).catch(() => {});
    if (err instanceof NowBuildError) {
      throw err;
    }
    throw new NowBuildError({
      code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
      message: `could not download ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function sha256File(filePath: string): Promise<string> {
  const data = await fs.promises.readFile(filePath);
  return createHash('sha256').update(new Uint8Array(data)).digest('hex');
}
