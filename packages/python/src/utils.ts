import fs from 'fs';
import { delimiter, join, delimiter as pathDelimiter } from 'path';
import { readConfigFile, execCommand } from '@vercel/build-utils';
import execa = require('execa');

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
  const pathKey = isWin ? 'Path' : 'PATH';
  const env: NodeJS.ProcessEnv = { ...baseEnv, VIRTUAL_ENV: venvPath };
  const binDir = getVenvBinDir(venvPath);
  const existingPath = env[pathKey] || process.env[pathKey] || '';
  env[pathKey] = existingPath ? `${binDir}${delimiter}${existingPath}` : binDir;
  return env;
}

export async function ensureVenv({
  pythonPath,
  venvPath,
}: {
  pythonPath: string;
  venvPath: string;
}) {
  const marker = join(venvPath, 'pyvenv.cfg');
  try {
    await fs.promises.access(marker);
    return;
  } catch {
    // fall through to creation
  }
  await fs.promises.mkdir(venvPath, { recursive: true });
  console.log(`Creating virtual environment at "${venvPath}"...`);
  await execa(pythonPath, ['-m', 'venv', venvPath]);
}

export function getVenvPythonBin(venvPath: string) {
  return join(getVenvBinDir(venvPath), isWin ? 'python.exe' : 'python');
}

export function getVenvPipBin(venvPath: string) {
  return join(getVenvBinDir(venvPath), isWin ? 'pip.exe' : 'pip');
}

export async function runPyprojectScript(
  workPath: string,
  scriptNames: string | Iterable<string>,
  env?: NodeJS.ProcessEnv
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
  useVirtualEnv(workPath, finalEnv, systemPython);

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
