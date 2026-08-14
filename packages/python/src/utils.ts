import fs from 'fs';
import { delimiter as pathDelimiter, join } from 'path';
import { readConfigFile, execCommand, debug } from '@vercel/build-utils';
import execa from 'execa';
import { getProtectedUvEnv } from './uv';

const isWin = process.platform === 'win32';

export const isInVirtualEnv = (): string | undefined => {
  return process.env.VIRTUAL_ENV;
};

export function getVenvBinDir(venvPath: string) {
  return join(venvPath, isWin ? 'Scripts' : 'bin');
}

export function useVirtualEnv(
  workPath: string,
  env: NodeJS.ProcessEnv,
  systemPython: string
): { pythonCmd: string; venvRoot?: string } {
  const venvDirs = ['.venv', 'venv'];
  let pythonCmd = systemPython;
  for (const venv of venvDirs) {
    const venvRoot = join(workPath, venv);
    const binDir =
      process.platform === 'win32'
        ? join(venvRoot, 'Scripts')
        : join(venvRoot, 'bin');
    const candidates =
      process.platform === 'win32'
        ? [join(binDir, 'python.exe'), join(binDir, 'python')]
        : [join(binDir, 'python3'), join(binDir, 'python')];
    const found = candidates.find(p => fs.existsSync(p));
    if (found) {
      pythonCmd = found;
      env.VIRTUAL_ENV = venvRoot;
      env.PATH = `${binDir}${pathDelimiter}${env.PATH || ''}`;
      return { pythonCmd, venvRoot };
    }
  }
  return { pythonCmd };
}

export function createVenvEnv(
  venvPath: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
  uvCacheDir?: string
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...getProtectedUvEnv(baseEnv, uvCacheDir),
    VIRTUAL_ENV: venvPath,
    UV_PROJECT_ENVIRONMENT: venvPath,
    UV_NO_DEV: 'true',
  };
  const binDir = getVenvBinDir(venvPath);
  const existingPath = env.PATH || process.env.PATH || '';
  env.PATH = existingPath ? `${binDir}${pathDelimiter}${existingPath}` : binDir;
  return env;
}

/**
 * Parse the `version` field from a pyvenv.cfg file and return the
 * "major.minor" string.  Returns null if the file
 * cannot be read or the version line is missing.
 */
async function readVenvPythonVersion(
  pyvenvCfgPath: string
): Promise<string | null> {
  try {
    const content = await fs.promises.readFile(pyvenvCfgPath, 'utf-8');
    const match = content.match(/^version\s*=\s*(\d+)\.(\d+)/m);
    return match ? `${match[1]}.${match[2]}` : null;
  } catch {
    return null;
  }
}

export async function ensureVenv({
  pythonVersion,
  venvPath,
  uvPath,
  uvCacheDir,
  quiet,
}: {
  pythonVersion: { pythonPath: string; major?: number; minor?: number };
  venvPath: string;
  uvPath?: string | null;
  uvCacheDir?: string;
  quiet?: boolean;
}) {
  const marker = join(venvPath, 'pyvenv.cfg');
  let venvExists = false;

  try {
    await fs.promises.access(marker);
    venvExists = true;
  } catch {
    // venv doesn't exist yet
  }

  // Invalidate if the cached venv was built with a different Python version.
  if (
    venvExists &&
    pythonVersion.major != null &&
    pythonVersion.minor != null
  ) {
    const expected = `${pythonVersion.major}.${pythonVersion.minor}`;
    const cachedVersion = await readVenvPythonVersion(marker);
    if (cachedVersion && cachedVersion !== expected) {
      if (!quiet) {
        console.log(
          `Cached venv Python ${cachedVersion} differs from requested ${expected}, recreating...`
        );
      }
      await fs.promises.rm(venvPath, { recursive: true, force: true });
      venvExists = false;
    }
  }

  if (venvExists) {
    debug(`Refreshing cached virtual environment at "${venvPath}"`);
  } else {
    await fs.promises.mkdir(venvPath, { recursive: true });
    if (!quiet) {
      console.log(`Creating virtual environment at "${venvPath}"...`);
    }
  }

  if (uvPath) {
    // --allow-existing allows uv to reuse a cached venv
    // --seed installs pip into the venv so custom install commands can use it
    const args = ['venv', venvPath, '--allow-existing', '--seed'];
    if (pythonVersion.major != null && pythonVersion.minor != null) {
      args.push('--python', `${pythonVersion.major}.${pythonVersion.minor}`);
    }
    await execa(uvPath, args, {
      env: getProtectedUvEnv(process.env, uvCacheDir),
    });
  } else {
    await execa(pythonVersion.pythonPath, ['-m', 'venv', venvPath]);
  }
}

export function getVenvPythonBin(venvPath: string) {
  return join(getVenvBinDir(venvPath), isWin ? 'python.exe' : 'python');
}

export async function runPyprojectScript(
  workPath: string,
  scriptNames: string | Iterable<string>,
  env?: NodeJS.ProcessEnv,
  useUserVirtualEnv = true
) {
  const pyprojectPath = join(workPath, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) return false;

  type Pyproject = {
    tool?: {
      vercel?: { scripts?: Record<string, string> };
    };
  };

  let pyproject: Pyproject | null = null;
  try {
    pyproject = await readConfigFile<Pyproject>(pyprojectPath);
  } catch {
    console.error('Failed to parse pyproject.toml');
    return false;
  }

  // Read scripts from [tool.vercel.scripts]
  const scripts: Record<string, string> =
    pyproject?.tool?.vercel?.scripts || {};
  const candidates =
    typeof scriptNames === 'string' ? [scriptNames] : Array.from(scriptNames);
  const scriptToRun = candidates.find(name => Boolean(scripts[name]));
  if (!scriptToRun) return false;

  // Use the Python from the virtualenv if present to resolve tooling, else system python
  const systemPython = process.platform === 'win32' ? 'python' : 'python3';
  const finalEnv = { ...process.env, ...env };
  if (useUserVirtualEnv) {
    useVirtualEnv(workPath, finalEnv, systemPython);
  }

  const scriptCommand = scripts[scriptToRun];
  if (typeof scriptCommand === 'string' && scriptCommand.trim()) {
    console.log(`Executing: ${scriptCommand}`);
    await execCommand(scriptCommand, {
      cwd: workPath,
      env: finalEnv,
    });
    return true;
  }

  // No command string was provided for the found script name
  return false;
}
