import fs from 'fs';
import { join, delimiter as pathDelimiter } from 'path';
import { readConfigFile, execCommand } from '@vercel/build-utils';
import execa = require('execa');

type PyprojectScriptsConfig = {
  tool?: {
    vercel?: { scripts?: Record<string, string> };
  };
};

export const isInVirtualEnv = (): string | undefined => {
  return process.env.VIRTUAL_ENV;
};

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

export async function ensureVirtualEnv(
  pythonPath: string,
  workPath: string
): Promise<string> {
  const venvRoot = join(workPath, '.venv');
  if (!fs.existsSync(venvRoot)) {
    await execa(pythonPath, ['-m', 'venv', venvRoot], { cwd: workPath });
    if (!fs.existsSync(venvRoot)) {
      throw new Error(`Failed to create virtualenv at ${venvRoot}`);
    }
    console.log(`Created virtualenv at ${venvRoot}`);
  }
  return venvRoot;
}

export async function containsVercelPyprojectScript(
  workPath: string,
  scriptNames: string | Iterable<string>
): Promise<boolean> {
  const pyprojectPath = join(workPath, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) return false;
  const pyproject = await readConfigFile<PyprojectScriptsConfig>(pyprojectPath);
  const scripts = pyproject?.tool?.vercel?.scripts || {};
  const candidates =
    typeof scriptNames === 'string' ? [scriptNames] : Array.from(scriptNames);
  return candidates.some(name => {
    const command = scripts[name];
    return typeof command === 'string' && command.trim().length > 0;
  });
}

export async function runPyprojectScript(
  workPath: string,
  scriptNames: string | Iterable<string>,
  env?: NodeJS.ProcessEnv
) {
  const pyprojectPath = join(workPath, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) return false;

  let pyproject: PyprojectScriptsConfig | null = null;
  try {
    pyproject = await readConfigFile<PyprojectScriptsConfig>(pyprojectPath);
  } catch {
    console.error('Failed to parse pyproject.toml');
    return false;
  }

  // Read scripts from [tool.vercel.scripts]
  const scripts = pyproject?.tool?.vercel?.scripts || {};
  const candidates =
    typeof scriptNames === 'string' ? [scriptNames] : Array.from(scriptNames);
  const scriptToRun = candidates.find(name => {
    const command = scripts[name];
    return typeof command === 'string' && command.trim().length > 0;
  });
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
