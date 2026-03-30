import fs from 'node:fs';
import path from 'node:path';
import type { FileFsRef } from '@vercel/build-utils';
import { debug, glob, runShellScript } from '@vercel/build-utils';

export function getExecutableName(binName: string): string {
  // The compiled binary in Windows has the `.exe` extension
  return process.platform === 'win32' ? `${binName}.exe` : binName;
}

export function assertEnv(name: string): string {
  if (!process.env[name]) {
    throw new Error(`Missing ENV variable process.env.${name}`);
  }
  return process.env[name] as unknown as string;
}

export async function runUserScripts(dir: string): Promise<void> {
  const buildScriptPath = path.join(dir, 'build.sh');
  const buildScriptExists = fs.existsSync(buildScriptPath);

  if (buildScriptExists) {
    debug('Running `build.sh`');
    await runShellScript(buildScriptPath);
  }
}

export async function gatherExtraFiles(
  globMatcher: string | string[] | undefined,
  workPath: string
): Promise<Record<string, FileFsRef>> {
  if (!globMatcher) return {};

  debug(
    `Gathering extra files for glob \`${JSON.stringify(
      globMatcher
    )}\` in ${workPath}`
  );

  if (Array.isArray(globMatcher)) {
    const allMatches = await Promise.all(
      globMatcher.map(pattern => glob(pattern, workPath))
    );

    return allMatches.reduce((acc, matches) => ({ ...acc, ...matches }), {});
  }

  return glob(globMatcher, workPath);
}
