import { delimiter, join } from 'path';
import { type PackageJson, spawnAsync } from '@vercel/build-utils';
import fs from 'fs-extra';
import type { BuildOutput, JsonParseError } from './do-build';

export async function initCorepack({
  repoRootPath,
  output,
  readJSONFile,
  isCantParseJSONFile,
  warmPackageManager = false,
}: {
  repoRootPath: string;
  output: BuildOutput;
  readJSONFile: <T>(file: string) => Promise<T | null | JsonParseError>;
  isCantParseJSONFile(value: unknown): value is JsonParseError;
  warmPackageManager?: boolean;
}): Promise<string | null> {
  if (process.env.ENABLE_EXPERIMENTAL_COREPACK !== '1') {
    // Since corepack is experimental, we need to exit early
    // unless the user explicitly enables it with the env var.
    return null;
  }
  const pkg = await readJSONFile<PackageJson>(
    join(repoRootPath, 'package.json')
  );
  if (isCantParseJSONFile(pkg)) {
    output.warn(
      'Warning: Could not enable corepack because package.json is invalid JSON',
      pkg.meta?.parseErrorLocation ?? pkg.message
    );
  } else if (!pkg?.packageManager) {
    output.warn(
      'Warning: Could not enable corepack because package.json is missing "packageManager" property'
    );
  } else {
    output.log(
      `Detected ENABLE_EXPERIMENTAL_COREPACK=1 and "${pkg.packageManager}" in package.json`
    );
    const corepackRootDir = join(repoRootPath, '.vercel', 'cache', 'corepack');
    const corepackHomeDir = join(corepackRootDir, 'home');
    const corepackShimDir = join(corepackRootDir, 'shim');
    await fs.mkdirp(corepackHomeDir);
    await fs.mkdirp(corepackShimDir);
    process.env.COREPACK_HOME = corepackHomeDir;
    process.env.PATH = `${corepackShimDir}${delimiter}${process.env.PATH}`;
    const pkgManagerName = pkg.packageManager.split('@')[0]!;
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

    // If we're running builds in parallel, we can pre-install the manager
    // so concurrent builds won't race for it.
    if (warmPackageManager) {
      try {
        await spawnAsync(pkgManagerName, ['--version'], {
          prettyCommand: `${pkgManagerName} --version`,
          stdio: 'pipe',
        });
      } catch (err) {
        // Non-fatal, because in the worst case each build's install will download the manager itself.
        output.debug(
          `Failed to pre-download "${pkg.packageManager}" via corepack: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
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
