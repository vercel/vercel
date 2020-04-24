import execa from 'execa';
import semver from 'semver';
import retry from 'async-retry';
import npa from 'npm-package-arg';
import pluralize from 'pluralize';
import { basename, join, resolve } from 'path';
import { PackageJson } from '@now/build-utils';
import XDGAppPaths from 'xdg-app-paths';
import { mkdirp, readJSON, writeJSON } from 'fs-extra';
import nowCliPkg from '../pkg';

import { NoBuilderCacheError } from '../errors-ts';
import { Output } from '../output';
import { getDistTag } from '../get-dist-tag';

import * as staticBuilder from './static-builder';
import { BuilderWithPackage } from './types';
import { getBundledBuilders } from './get-bundled-builders';

declare const __non_webpack_require__: typeof require;

const registryTypes = new Set(['version', 'tag', 'range']);

const localBuilders: { [key: string]: BuilderWithPackage } = {
  '@now/static': {
    runInProcess: true,
    requirePath: '@now/static',
    builder: Object.freeze(staticBuilder),
    package: Object.freeze({ name: '@now/static', version: '' }),
  },
};

const distTag = nowCliPkg.version ? getDistTag(nowCliPkg.version) : 'canary';

export const cacheDirPromise = prepareCacheDir();
export const builderDirPromise = prepareBuilderDir();

/**
 * Prepare cache directory for installing now-builders
 */
export async function prepareCacheDir() {
  const { NOW_BUILDER_CACHE_DIR } = process.env;
  const designated = NOW_BUILDER_CACHE_DIR
    ? resolve(NOW_BUILDER_CACHE_DIR)
    : XDGAppPaths('co.zeit.now').cache();

  if (!designated) {
    throw new NoBuilderCacheError();
  }

  const cacheDir = join(designated, 'dev');
  await mkdirp(cacheDir);
  return cacheDir;
}

export async function prepareBuilderDir() {
  const builderDir = join(await cacheDirPromise, 'builders');
  await mkdirp(builderDir);

  // Create an empty `package.json` file, only if one does not already exist
  try {
    const buildersPkg = join(builderDir, 'package.json');
    await writeJSON(buildersPkg, { private: true }, { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }

  return builderDir;
}

function getNpmVersion(use = ''): string {
  const parsed = npa(use);
  if (registryTypes.has(parsed.type)) {
    return parsed.fetchSpec || '';
  }
  return '';
}

export function getBuildUtils(packages: string[]): string {
  const version = packages
    .map(getNpmVersion)
    .some(ver => ver.includes('canary'))
    ? 'canary'
    : 'latest';

  return `@now/build-utils@${version}`;
}

function parseVersionSafe(rawSpec: string) {
  try {
    return semver.parse(rawSpec);
  } catch (e) {
    return null;
  }
}

export function filterPackage(
  builderSpec: string,
  distTag: string,
  buildersPkg: PackageJson,
  nowCliPkg: PackageJson = {}
) {
  if (builderSpec in localBuilders) return false;
  const parsed = npa(builderSpec);
  const parsedVersion = parseVersionSafe(parsed.rawSpec);

  // If it's a builder that is part of Now CLI's `dependencies` then
  // the builder is already installed into `node_modules`
  if (isBundledBuilder(parsed, nowCliPkg)) {
    return false;
  }

  // Skip install of already installed Runtime
  if (
    parsed.name &&
    parsed.type === 'version' &&
    parsedVersion &&
    buildersPkg.dependencies &&
    parsedVersion.version == buildersPkg.dependencies[parsed.name]
  ) {
    return false;
  }
  if (
    parsed.name &&
    parsed.type === 'tag' &&
    parsed.fetchSpec === distTag &&
    getBundledBuilders().includes(parsed.name) &&
    buildersPkg.dependencies
  ) {
    const parsedInstalled = npa(
      `${parsed.name}@${buildersPkg.dependencies[parsed.name]}`
    );
    if (parsedInstalled.type !== 'version') {
      return true;
    }
    const semverInstalled = semver.parse(parsedInstalled.rawSpec);
    if (!semverInstalled) {
      return true;
    }
    if (semverInstalled.prerelease.length > 0) {
      return semverInstalled.prerelease[0] !== distTag;
    }
    if (distTag === 'latest') {
      return false;
    }
  }
  return true;
}

/**
 * Install a list of builders to the cache directory.
 */
export async function installBuilders(
  packagesSet: Set<string>,
  output: Output,
  builderDir?: string
): Promise<void> {
  const packages = Array.from(packagesSet);
  if (
    packages.length === 0 ||
    (packages.length === 1 &&
      Object.hasOwnProperty.call(localBuilders, packages[0]))
  ) {
    // Static deployment, no builders to install
    return;
  }
  if (!builderDir) {
    builderDir = await builderDirPromise;
  }
  const buildersPkgPath = join(builderDir, 'package.json');
  const buildersPkgBefore = await readJSON(buildersPkgPath);
  const depsBefore = {
    ...buildersPkgBefore.devDependencies,
    ...buildersPkgBefore.dependencies,
  };

  packages.push(getBuildUtils(packages));

  // Filter out any packages that come packaged with `now-cli`
  const packagesToInstall = packages.filter(p =>
    filterPackage(p, distTag, buildersPkgBefore)
  );

  if (packagesToInstall.length === 0) {
    output.debug('No Runtimes need to be installed');
    return;
  }

  const stopSpinner = output.spinner(
    `Installing ${pluralize(
      'Runtime',
      packagesToInstall.length
    )}: ${packagesToInstall.sort().join(', ')}`
  );

  try {
    await retry(
      () =>
        execa(
          'npm',
          [
            'install',
            '--save-exact',
            '--no-package-lock',
            ...packagesToInstall,
          ],
          {
            cwd: builderDir,
          }
        ),
      { retries: 2 }
    );
  } finally {
    stopSpinner();
  }

  const updatedPackages: string[] = [];
  const buildersPkgAfter = await readJSON(buildersPkgPath);
  const depsAfter = {
    ...buildersPkgAfter.devDependencies,
    ...buildersPkgAfter.dependencies,
  };
  for (const [name, version] of Object.entries(depsAfter)) {
    if (version !== depsBefore[name]) {
      output.debug(`Runtime "${name}" updated to version \`${version}\``);
      updatedPackages.push(name);
    }
  }

  purgeRequireCache(updatedPackages, builderDir, output);
}

export async function updateBuilders(
  packagesSet: Set<string>,
  output: Output,
  builderDir?: string
): Promise<string[]> {
  if (!builderDir) {
    builderDir = await builderDirPromise;
  }

  const updatedPackages: string[] = [];
  const packages = Array.from(packagesSet);
  const buildersPkgPath = join(builderDir, 'package.json');
  const buildersPkgBefore = await readJSON(buildersPkgPath);
  const depsBefore = {
    ...buildersPkgBefore.devDependencies,
    ...buildersPkgBefore.dependencies,
  };

  const packagesToUpdate = packages.filter(p => {
    if (p in localBuilders) return false;

    // If it's a builder that is part of Now CLI's `dependencies` then
    // don't update it
    if (isBundledBuilder(npa(p), nowCliPkg)) {
      return false;
    }

    return true;
  });

  if (packagesToUpdate.length > 0) {
    packages.push(getBuildUtils(packages));

    await retry(
      () =>
        execa(
          'npm',
          ['install', '--save-exact', '--no-package-lock', ...packagesToUpdate],
          {
            cwd: builderDir,
          }
        ),
      { retries: 2 }
    );

    const buildersPkgAfter = await readJSON(buildersPkgPath);
    const depsAfter = {
      ...buildersPkgAfter.devDependencies,
      ...buildersPkgAfter.dependencies,
    };
    for (const [name, version] of Object.entries(depsAfter)) {
      if (version !== depsBefore[name]) {
        output.debug(`Runtime "${name}" updated to version \`${version}\``);
        updatedPackages.push(name);
      }
    }

    purgeRequireCache(updatedPackages, builderDir, output);
  }

  return updatedPackages;
}

/**
 * Get a builder from the cache directory.
 */
export async function getBuilder(
  builderPkg: string,
  output: Output,
  builderDir?: string,
  isRetry = false
): Promise<BuilderWithPackage> {
  let builderWithPkg: BuilderWithPackage = localBuilders[builderPkg];
  if (!builderWithPkg) {
    if (!builderDir) {
      builderDir = await builderDirPromise;
    }
    let requirePath: string;
    const parsed = npa(builderPkg);

    // First check if it's a bundled Runtime in Now CLI's `node_modules`
    const bundledBuilder = isBundledBuilder(parsed, nowCliPkg);
    if (bundledBuilder && parsed.name) {
      requirePath = parsed.name;
    } else {
      const buildersPkg = await readJSON(join(builderDir, 'package.json'));
      const pkgName = getPackageName(parsed, buildersPkg) || builderPkg;
      requirePath = join(builderDir, 'node_modules', pkgName);
    }

    try {
      output.debug(`Requiring runtime: "${requirePath}"`);
      const mod = require(requirePath);
      const pkg = require(join(requirePath, 'package.json'));
      builderWithPkg = {
        requirePath,
        builder: Object.freeze(mod),
        package: Object.freeze(pkg),
      };
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND' && !isRetry) {
        output.debug(
          `Attempted to require ${requirePath}, but it is not installed`
        );
        const pkgSet = new Set([builderPkg]);
        await installBuilders(pkgSet, output, builderDir);

        // Run `getBuilder()` again now that the builder has been installed
        return getBuilder(builderPkg, output, builderDir, true);
      }
      throw err;
    }

    // If it's a bundled builder, then cache the require call
    if (bundledBuilder) {
      localBuilders[builderPkg] = builderWithPkg;
    }
  }
  return builderWithPkg;
}

export function isBundledBuilder(
  parsed: npa.Result,
  pkg: PackageJson
): boolean {
  if (!parsed.name || !pkg.dependencies) {
    return false;
  }

  const bundledVersion = pkg.dependencies[parsed.name];
  if (bundledVersion) {
    if (parsed.type === 'tag') {
      if (parsed.fetchSpec === 'canary') {
        return bundledVersion.includes('canary');
      } else if (parsed.fetchSpec === 'latest') {
        return !bundledVersion.includes('canary');
      }
    } else if (parsed.type === 'version') {
      return parsed.fetchSpec === bundledVersion;
    }
  }

  return false;
}

function getPackageName(
  parsed: npa.Result,
  buildersPkg: PackageJson
): string | null {
  if (registryTypes.has(parsed.type)) {
    return parsed.name;
  }
  const deps: { [name: string]: string } = {
    ...buildersPkg.devDependencies,
    ...buildersPkg.dependencies,
  };
  for (const [name, dep] of Object.entries(deps)) {
    if (dep === parsed.raw || basename(dep) === basename(parsed.raw)) {
      return name;
    }
  }
  return null;
}

function purgeRequireCache(
  packages: string[],
  builderDir: string,
  output: Output
) {
  const _require =
    typeof __non_webpack_require__ === 'function'
      ? __non_webpack_require__
      : require;

  // The `require()` cache for the builder's assets must be purged
  const packagesPaths = packages.map(b => join(builderDir, 'node_modules', b));
  for (const id of Object.keys(_require.cache)) {
    for (const path of packagesPaths) {
      if (id.startsWith(path)) {
        output.debug(`Purging require cache for "${id}"`);
        delete _require.cache[id];
      }
    }
  }
}
