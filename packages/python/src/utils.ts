import fs from 'fs';
import os from 'os';
import { delimiter as pathDelimiter, join } from 'path';
import { readConfigFile, execCommand } from '@vercel/build-utils';
import * as detectLibc from 'detect-libc';
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
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...getProtectedUvEnv(baseEnv),
    VIRTUAL_ENV: venvPath,
  };
  const binDir = getVenvBinDir(venvPath);
  const existingPath = env.PATH || process.env.PATH || '';
  env.PATH = existingPath ? `${binDir}${pathDelimiter}${existingPath}` : binDir;
  return env;
}

export async function ensureVenv({
  pythonPath,
  venvPath,
  uvPath,
  quiet,
}: {
  pythonPath: string;
  venvPath: string;
  uvPath?: string | null;
  quiet?: boolean;
}) {
  const marker = join(venvPath, 'pyvenv.cfg');
  try {
    await fs.promises.access(marker);
    return;
  } catch {
    // fall through to creation
  }
  await fs.promises.mkdir(venvPath, { recursive: true });
  if (!quiet) {
    console.log(`Creating virtual environment at "${venvPath}"...`);
  }
  if (uvPath) {
    await execa(uvPath, ['venv', venvPath]);
  } else {
    await execa(pythonPath, ['-m', 'venv', venvPath]);
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

export interface PlatformInfo {
  /** Wheel tag OS name: "manylinux" or "musllinux" */
  osName: string;
  /** Wheel tag arch: "x86_64", "aarch64", etc. */
  archName: string;
  /** Libc major version (glibc major or musl major) */
  osMajor: number;
  /** Libc minor version */
  osMinor: number;
  /** High-level OS for PythonBuild: always "linux" for Lambda */
  os: string;
  /** High-level libc for PythonBuild: "gnu" or "musl" */
  libc: string;
}

// Map Node.js arch names to uv platform tag arch names
const ARCH_MAP: Record<string, string> = {
  x64: 'x86_64',
  arm64: 'aarch64',
  ia32: 'i686',
  arm: 'armv7l',
  ppc64: 'ppc64le',
  s390x: 's390x',
};

/**
 * Detect the Lambda target platform for wheel compatibility checking.
 *
 * The Lambda runtime is always Linux. On the Vercel build image (which shares
 * the Lambda base), we use `detect-libc` to get the exact glibc/musl version.
 * For local `vercel build` on non-Linux hosts we fall back to conservative
 * defaults (manylinux, glibc 2.17, x86_64).
 */
export function detectPlatform(): PlatformInfo {
  const arch = os.arch();
  const archName = ARCH_MAP[arch] || arch;

  // Lambda is always Linux — detect libc family and version from the
  // build image (which runs the same base as the Lambda runtime).
  const libcFamily = detectLibc.familySync();
  const libcVersion = detectLibc.versionSync();

  let osName: string;
  let osMajor: number;
  let osMinor: number;

  if (libcFamily === detectLibc.MUSL) {
    osName = 'musllinux';
  } else {
    osName = 'manylinux';
  }

  if (libcVersion) {
    const parts = libcVersion.split('.');
    osMajor = parseInt(parts[0], 10);
    osMinor = parseInt(parts[1], 10) || 0;
  } else if (libcFamily === detectLibc.GLIBC) {
    // glibc detected but version unknown — use conservative default
    osMajor = 2;
    osMinor = 17;
  } else {
    // Non-Linux host (local `vercel build` on macOS/Windows).
    // Fall back to conservative manylinux defaults.
    osMajor = 2;
    osMinor = 17;
  }

  const libc = libcFamily === detectLibc.MUSL ? 'musl' : 'gnu';

  return { osName, archName, osMajor, osMinor, os: 'linux', libc };
}
