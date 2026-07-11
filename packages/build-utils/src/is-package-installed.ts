import debug from './debug';

export async function isPackageInstalled(
  packageName: string,
  path?: string | string[]
): Promise<boolean> {
  try {
    const resolved = require.resolve(packageName, {
      paths: path ? (Array.isArray(path) ? path : [path]) : [process.cwd()],
    });

    require(resolved);

    return true;
  } catch (err) {
    debug(
      `Could not resolve package "${packageName}". Package is not installed.`,
      err
    );
    return false;
  }
}
