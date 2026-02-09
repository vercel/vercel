import { execSync } from 'child_process';
import { join } from 'path';
import { delimiter as pathDelimiter } from 'path';
import execa from 'execa';
import fs from 'fs';
import os from 'os';
import which from 'which';
import { debug } from '@vercel/build-utils';

/**
 * Represents a package entry from uv.lock with source information.
 */
export interface UvLockPackage {
  name: string;
  version: string;
  source?: {
    registry?: string;
    url?: string;
    git?: string;
    path?: string;
    editable?: string;
  };
}

/**
 * Parsed uv.lock file structure.
 */
export interface UvLockFile {
  version?: number;
  package?: UvLockPackage[];
}

export const UV_VERSION = '0.9.22';
export const UV_PYTHON_PATH_PREFIX = '/uv/python/';
export const UV_PYTHON_DOWNLOADS_MODE = 'automatic';

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

export function findUvInPath(): string | null {
  return which.sync('uv', { nothrow: true });
}

export class UvRunner {
  private uvPath: string;

  constructor(uvPath: string) {
    this.uvPath = uvPath;
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
      output = execSync(
        `${this.uvPath} python list --only-installed --output-format json`,
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
  }): Promise<void> {
    const { venvPath, projectDir, locked } = options;
    const args = ['sync', '--active', '--no-dev', '--link-mode', 'copy'];
    if (locked) {
      args.push('--locked');
    }
    args.push('--no-editable');
    await this.runUvCmd(args, projectDir, venvPath);
  }

  async lock(projectDir: string): Promise<void> {
    const args = ['lock'];
    const pretty = `uv ${args.join(' ')}`;
    debug(`Running "${pretty}" in ${projectDir}...`);
    try {
      await execa(this.uvPath, args, {
        cwd: projectDir,
        env: getProtectedUvEnv(process.env),
      });
    } catch (err) {
      throw new Error(
        `Failed to run "${pretty}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
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
      ...getProtectedUvEnv(process.env),
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
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    UV_PYTHON_DOWNLOADS: UV_PYTHON_DOWNLOADS_MODE,
  };
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

/**
 * Parse a uv.lock file (TOML format) to extract package information.
 * This is a simplified TOML parser that handles the specific structure of uv.lock.
 */
export async function parseUvLockFile(lockPath: string): Promise<UvLockFile> {
  const content = await fs.promises.readFile(lockPath, 'utf8');
  const packages: UvLockPackage[] = [];

  // Split into package blocks - each [[package]] section
  const packageBlocks = content.split(/\[\[package\]\]/);

  for (const block of packageBlocks.slice(1)) {
    // Skip the header section before first [[package]]
    const pkg: UvLockPackage = { name: '', version: '' };

    // Parse name
    const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m);
    if (nameMatch) pkg.name = nameMatch[1];

    // Parse version
    const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m);
    if (versionMatch) pkg.version = versionMatch[1];

    // Parse source section if present
    const sourceSection = block.match(/\[package\.source\]([\s\S]*?)(?=\[|$)/);
    if (sourceSection) {
      pkg.source = {};
      const sourceContent = sourceSection[1];

      const registryMatch = sourceContent.match(/registry\s*=\s*"([^"]+)"/);
      if (registryMatch) pkg.source.registry = registryMatch[1];

      const urlMatch = sourceContent.match(/url\s*=\s*"([^"]+)"/);
      if (urlMatch) pkg.source.url = urlMatch[1];

      const gitMatch = sourceContent.match(/git\s*=\s*"([^"]+)"/);
      if (gitMatch) pkg.source.git = gitMatch[1];

      const pathMatch = sourceContent.match(/path\s*=\s*"([^"]+)"/);
      if (pathMatch) pkg.source.path = pathMatch[1];

      const editableMatch = sourceContent.match(/editable\s*=\s*"([^"]+)"/);
      if (editableMatch) pkg.source.editable = editableMatch[1];
    }

    if (pkg.name && pkg.version) {
      packages.push(pkg);
    }
  }

  return { package: packages };
}
