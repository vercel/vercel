import { delimiter, join } from 'path';
import { type PackageJson, spawnAsync } from '@vercel/build-utils';
import fs from 'fs-extra';
import { CantParseJSONFile } from '../errors-ts';
import { VERCEL_DIR } from '../projects/link';
import readJSONFile from '../read-json-file';
import output from '../../output-manager';

export async function initCorepack({
  repoRootPath,
}: {
  repoRootPath: string;
}): Promise<string | null> {
  if (process.env.ENABLE_EXPERIMENTAL_COREPACK !== '1') {
    // Since corepack is experimental, we need to exit early
    // unless the user explicitly enables it with the env var.
    return null;
  }
  const pkg = await readJSONFile<PackageJson>(
    join(repoRootPath, 'package.json')
  );
  if (pkg instanceof CantParseJSONFile) {
    output.warn(
      'Warning: Could not enable corepack because package.json is invalid JSON',
      pkg.meta.parseErrorLocation
    );
  } else if (!pkg?.packageManager) {
    output.warn(
      'Warning: Could not enable corepack because package.json is missing "packageManager" property'
    );
  } else {
    output.log(
      `Detected ENABLE_EXPERIMENTAL_COREPACK=1 and "${pkg.packageManager}" in package.json`
    );
    const corepackRootDir = join(repoRootPath, VERCEL_DIR, 'cache', 'corepack');
    const corepackHomeDir = join(corepackRootDir, 'home');
    const corepackShimDir = join(corepackRootDir, 'shim');
    await fs.mkdirp(corepackHomeDir);
    await fs.mkdirp(corepackShimDir);
    process.env.COREPACK_HOME = corepackHomeDir;
    process.env.PATH = `${corepackShimDir}${delimiter}${process.env.PATH}`;
    const pkgManagerName = pkg.packageManager.split('@')[0];
    // We must explicitly call `corepack enable npm` since `corepack enable`
    // doesn't work with npm. See https://github.com/nodejs/corepack/pull/24
    // Also, `corepack enable` is too broad and will change the version of
    // yarn & pnpm even though those versions are not specified by the user.
    // See https://github.com/nodejs/corepack#known-good-releases
    // Finally, we use `--install-directory` so we can cache the result to
    // reuse for subsequent builds. See `@vercel/vc-build` for `prepareCache`.
    await spawnAsync(
      'corepack',
      ['enable', pkgManagerName, '--install-directory', corepackShimDir],
      {
        prettyCommand: `corepack enable ${pkgManagerName}`,
      }
    );
    return corepackShimDir;
  }
  return null;
}

export function cleanupCorepack(corepackShimDir: string) {
  if (process.env.COREPACK_HOME) {
    delete process.env.COREPACK_HOME;
  }
  if (process.env.PATH) {
    process.env.PATH = process.env.PATH.replace(
      `${corepackShimDir}${delimiter}`,
      ''
    );
  }
}
