import debug from './debug';

export async function getInstalledPackageVersion(
  packageName: string,
  path?: string | string[]
): Promise<string | undefined> {
  try {
    const resolved = require.resolve(`${packageName}/package.json`, {
      paths: path ? (Array.isArray(path) ? path : [path]) : [process.cwd()],
    });

    const version: string = require(resolved).version;

    return version;
  } catch (err) {
    debug(
      `Could not resolve package "${packageName}". Package is not installed.`,
      err
    );
    return undefined;
  }
}
