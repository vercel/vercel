import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import debug from './debug';

export async function getInstalledPackageVersion(
  packageName: string,
  path?: string | string[]
): Promise<string | undefined> {
  const paths = path ? (Array.isArray(path) ? path : [path]) : [process.cwd()];
  for (const searchPath of paths) {
    try {
      // Resolve from the real project, not the CLI's virtual snapshot. The
      // native loader does not reliably honor require.resolve's `paths` option.
      const projectRequire = createRequire(
        join(resolve(searchPath), 'package.json')
      );
      const resolved = projectRequire.resolve(`${packageName}/package.json`);
      const { version } = JSON.parse(await readFile(resolved, 'utf8'));
      return version;
    } catch (err) {
      debug(
        `Could not resolve package "${packageName}". Package is not installed.`,
        err
      );
    }
  }
  return undefined;
}
