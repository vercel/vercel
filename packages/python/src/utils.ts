import fs from 'fs';
import { join, delimiter as pathDelimiter } from 'path';
import execa from 'execa';
import { readConfigFile } from '@vercel/build-utils';
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
  scriptNames: string | Iterable<string>
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

  // Only support [tool.vercel.scripts]
  const scripts: Record<string, string> =
    pyproject?.tool?.vercel?.scripts || {};
  const candidates =
    typeof scriptNames === 'string' ? [scriptNames] : Array.from(scriptNames);
  const scriptToRun = candidates.find(name => Boolean(scripts[name]));
  if (!scriptToRun) return false;

  // Use the Python from the virtualenv if present to resolve uv, else system python
  const systemPython = process.platform === 'win32' ? 'python' : 'python3';
  const env = { ...process.env };
  const { pythonCmd } = useVirtualEnv(workPath, env, systemPython);
  const uvPath = await getUvBinaryOrInstall(pythonCmd);

  // Prefer executing the actual script command to avoid relying on uv's --script support/version.
  const scriptCommand = scripts[scriptToRun];
  if (typeof scriptCommand === 'string' && scriptCommand.trim()) {
    // Basic tokenizer that respects simple double-quoted segments
    const tokens =
      scriptCommand.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(t => {
        if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
        return t;
      }) || [];
    // If the script already starts with "uv", run it directly with our resolved uv binary.
    if (tokens[0] && tokens[0].toLowerCase() === 'uv') {
      tokens[0] = uvPath;
      console.log(
        `Executing: ${tokens
          .map(a => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
          .join(' ')}`
      );
      await execa(tokens[0], tokens.slice(1), {
        cwd: workPath,
        stdio: 'inherit',
        env,
      });
      return true;
    } else {
      const args = ['run', ...tokens];
      console.log(
        `Executing: ${uvPath} ${args
          .map(a => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
          .join(' ')}`
      );
      await execa(uvPath, args, {
        cwd: workPath,
        stdio: 'inherit',
        env,
      });
      return true;
    }
  }

  // No command string was provided for the found script name
  return false;
}
