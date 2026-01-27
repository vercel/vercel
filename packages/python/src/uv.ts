import { execSync } from 'child_process';
import { join } from 'path';
import { delimiter as pathDelimiter } from 'path';
import execa from 'execa';
import fs from 'fs';
import os from 'os';
import which from 'which';
import { debug } from '@vercel/build-utils';

/** This doesn't belong here, it should be inside the build container dockerfile only */
export const UV_VERSION = '0.9.22';

/** This is where we install uv-managed Python versions in the build container */
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

export class UvRunner {
  private uvPath: string;
  private venvPath: string | null = null;
  private installedPythonsCache: Set<string> | null = null;

  constructor(uvPath?: string) {
    this.uvPath = uvPath ?? this.findUvBinaryOrThrow();
  }

  private findUvBinaryOrThrow(): string {
    const path = which.sync('uv', { nothrow: true });
    if (!path) {
      throw new Error('uv is required but was not found in PATH.');
    }
    return path;
  }

  getPath(): string {
    return this.uvPath;
  }

  setVenvPath(venvPath: string): void {
    this.venvPath = venvPath;
  }

  resetCache(): void {
    this.installedPythonsCache = null;
  }

  /**
   * List installed Python versions managed by uv.
   * Only returns cpython installations under /uv/python/ (excludes system Python).
   * Results are cached for the lifetime of this instance.
   */
  listInstalledPythons(): Set<string> {
    if (this.installedPythonsCache !== null) {
      return this.installedPythonsCache;
    }

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
      this.installedPythonsCache = new Set();
      return this.installedPythonsCache;
    }

    let pyList: UvPythonEntry[];
    try {
      pyList = JSON.parse(output);
    } catch (err) {
      throw new Error(
        `Failed to parse 'uv python list' output: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    this.installedPythonsCache = new Set(
      pyList
        .filter(
          entry =>
            entry.path !== null &&
            entry.path.startsWith(UV_PYTHON_PATH_PREFIX) &&
            entry.implementation === 'cpython'
        )
        .map(
          entry => `${entry.version_parts.major}.${entry.version_parts.minor}`
        )
    );

    return this.installedPythonsCache;
  }

  async sync(options: { projectDir: string; locked?: boolean }): Promise<void> {
    const { projectDir, locked } = options;
    const args = ['sync', '--active', '--no-dev', '--link-mode', 'copy'];
    if (locked) {
      args.push('--locked');
    }
    args.push('--no-editable');
    await this.runCommand(args, projectDir);
  }

  async lock(projectDir: string): Promise<void> {
    const args = ['lock'];
    const pretty = `uv ${args.join(' ')}`;
    debug(`Running "${pretty}" in ${projectDir}...`);
    try {
      await execa(this.uvPath, args, {
        cwd: projectDir,
        env: this.getProtectedEnv(),
      });
    } catch (err) {
      throw new Error(
        `Failed to run "${pretty}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async addDependencies(options: {
    projectDir: string;
    dependencies: string[];
  }): Promise<void> {
    const { projectDir, dependencies } = options;
    const toAdd = dependencies.filter(Boolean);
    if (!toAdd.length) return;

    const args = ['add', '--active', ...toAdd];
    debug(`Running "uv ${args.join(' ')}" in ${projectDir}...`);
    await this.runCommand(args, projectDir);
  }

  async addFromFile(options: {
    projectDir: string;
    requirementsPath: string;
  }): Promise<void> {
    const { projectDir, requirementsPath } = options;
    const args = ['add', '--active', '-r', requirementsPath];
    debug(`Running "uv ${args.join(' ')}" in ${projectDir}...`);
    await this.runCommand(args, projectDir);
  }

  private async runCommand(args: string[], cwd: string): Promise<void> {
    if (!this.venvPath) {
      throw new Error('venvPath must be set before running uv commands');
    }

    const pretty = `uv ${args.join(' ')}`;
    debug(`Running "${pretty}"...`);

    try {
      await execa(this.uvPath, args, {
        cwd,
        env: this.getVenvEnv(),
      });
    } catch (err) {
      throw new Error(
        `Failed to run "${pretty}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private getProtectedEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      UV_PYTHON_DOWNLOADS: UV_PYTHON_DOWNLOADS_MODE,
    };
  }

  private getVenvEnv(): NodeJS.ProcessEnv {
    if (!this.venvPath) {
      throw new Error('venvPath must be set');
    }
    const binDir = isWin
      ? join(this.venvPath, 'Scripts')
      : join(this.venvPath, 'bin');
    const existingPath = process.env.PATH || '';
    return {
      ...this.getProtectedEnv(),
      VIRTUAL_ENV: this.venvPath,
      PATH: existingPath ? `${binDir}${pathDelimiter}${existingPath}` : binDir,
    };
  }
}

let uvRunnerInstance: UvRunner | null = null;

/** Get or create the singleton UvRunner instance */
export function getUvRunner(): UvRunner {
  if (!uvRunnerInstance) {
    uvRunnerInstance = new UvRunner();
  }
  return uvRunnerInstance;
}

/** Used for tests only */
export function resetUvRunner(): void {
  if (uvRunnerInstance) {
    uvRunnerInstance.resetCache();
  }
  uvRunnerInstance = null;
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
