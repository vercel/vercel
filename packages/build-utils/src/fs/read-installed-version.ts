import { readJSON } from 'fs-extra';
import { cwd } from 'node:process';

export async function readInstalledVersion(
  pkgName: string
): Promise<string | undefined> {
  try {
    const descriptorPath = require.resolve(`${pkgName}/package.json`, {
      paths: [cwd()],
    });
    const descriptor = await readJSON(descriptorPath);
    return descriptor?.version;
  } catch {
    // ignore errors: the package is simply not installed.
  }
  return;
}
