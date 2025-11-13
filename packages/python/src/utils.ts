import fs from 'fs';
import { join, dirname, delimiter as pathDelimiter } from 'path';
import execa from 'execa';
import { readConfigFile, execCommand } from '@vercel/build-utils';
import { getUvBinaryOrInstall } from './install';

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

  // Use the Python from the virtualenv if present to resolve uv, else system python
  const systemPython = process.platform === 'win32' ? 'python' : 'python3';
  const finalEnv = { ...process.env, ...env };
  const { pythonCmd } = useVirtualEnv(workPath, finalEnv, systemPython);
  const uvPath = await getUvBinaryOrInstall(pythonCmd);

  const scriptCommand = scripts[scriptToRun];
  if (typeof scriptCommand === 'string' && scriptCommand.trim()) {
    // Ensure our resolved uv is discoverable when the script uses `uv ...`
    const uvDir = dirname(uvPath);
    finalEnv.PATH = `${uvDir}${pathDelimiter}${finalEnv.PATH || ''}`;

    // If the script already starts with "uv", execute it directly via the shell.
    if (/^\s*uv(\s|$)/i.test(scriptCommand)) {
      console.log(`Executing: ${scriptCommand}`);
      await execCommand(scriptCommand, {
        cwd: workPath,
        env: finalEnv,
      });
      return true;
    }

    // Otherwise, run the command within `uv run` using the OS shell to preserve quoting.
    const args =
      process.platform === 'win32'
        ? ['run', 'cmd', '/d', '/s', '/c', scriptCommand]
        : ['run', 'sh', '-lc', scriptCommand];
    console.log(
      `Executing: ${uvPath} ${args
        .map(a => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
        .join(' ')}`
    );
    await execa(uvPath, args, {
      cwd: workPath,
      stdio: 'inherit',
      env: finalEnv,
    });
    return true;
  }

  // No command string was provided for the found script name
  return false;
}
