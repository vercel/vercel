import { accessSync, constants } from 'node:fs';
import { platform } from 'node:os';
import { delimiter, isAbsolute, resolve } from 'node:path';
import which from 'which';
import { execFileAsync } from './exec-file';

const executables = new Map<string, Promise<string>>();

/** Resolve Apple's Git launcher once, while preserving custom Git on PATH. */
export function getGitExecutable(cwd: string): Promise<string> {
  if (platform() !== 'darwin') return Promise.resolve('git');

  const searchPath = (process.env.PATH ?? '/usr/bin:/bin')
    .split(delimiter)
    .map(directory => resolve(cwd, directory))
    .join(delimiter);
  const key = JSON.stringify([
    searchPath,
    cwd,
    process.env.DEVELOPER_DIR,
    process.env.SDKROOT,
    process.env.TOOLCHAINS,
  ]);
  let executable = executables.get(key);
  if (!executable) {
    executable = resolveExecutable(searchPath, cwd);
    executables.set(key, executable);
  }
  return executable;
}

async function resolveExecutable(
  searchPath: string,
  cwd: string
): Promise<string> {
  try {
    if (
      which.sync('git', { path: searchPath, nothrow: true }) !== '/usr/bin/git'
    ) {
      return 'git';
    }
    // /usr/bin/git launches developer-tool discovery on every invocation.
    // xcrun honors the selected Xcode/Command Line Tools and DEVELOPER_DIR.
    const { stdout } = await execFileAsync(
      '/usr/bin/xcrun',
      ['--find', 'git'],
      { cwd }
    );
    const executable = stdout.trim();
    if (isAbsolute(executable) && executable !== '/usr/bin/git') {
      accessSync(executable, constants.X_OK);
      return executable;
    }
  } catch {
    // Keep normal Git behavior, including its errors, if discovery fails.
  }
  return 'git';
}
