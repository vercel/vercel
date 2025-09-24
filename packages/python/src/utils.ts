import { spawn } from 'child_process';
import fs from 'fs';
import { join, delimiter as pathDelimiter } from 'path';

type AsgiServer = 'uvicorn' | 'hypercorn';

export const tryImport = (pythonPath: string, mod: 'uvicorn' | 'hypercorn') =>
  new Promise<boolean>(res => {
    const check = spawn(pythonPath, ['-c', `import ${mod}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    check.once('error', () => res(false));
    check.once('exit', code => res(code === 0));
  });

export const detectAsgiServer = async (workPath: string, pythonPath: string) =>
  new Promise<AsgiServer>((resolve, reject) => {
    tryImport(pythonPath, 'uvicorn').then(hasUvicorn => {
      if (hasUvicorn) return resolve('uvicorn');
      tryImport(pythonPath, 'hypercorn').then(hasHypercorn => {
        if (hasHypercorn) return resolve('hypercorn');
        const { venvRoot } = useVirtualEnv(workPath, {}, pythonPath);
        const baseErrorMessage =
          'No ASGI server found. Please install either "uvicorn" or "hypercorn" (e.g. "pip install uvicorn").';
        const errorMessage = !venvRoot
          ? `${baseErrorMessage} If you are using a virtual environment, please activate it and try again.`
          : baseErrorMessage;
        reject(new Error(errorMessage));
      });
    });
  });

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
