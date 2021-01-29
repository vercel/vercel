import chalk from 'chalk';
import execa from 'execa';
import semver from 'semver';
import npa from 'npm-package-arg';
import pluralize from 'pluralize';
import { basename, join } from 'path';
import XDGAppPaths from 'xdg-app-paths';
import { mkdirp, readJSON, writeJSON } from 'fs-extra';
import { NowBuildError, PackageJson } from '@vercel/build-utils';
import cliPkg from '../pkg';

import cmd from '../output/cmd';
import { Output } from '../output';
import { getDistTag } from '../get-dist-tag';
import { NoBuilderCacheError } from '../errors-ts';

import * as staticBuilder from './static-builder';
import { BuilderWithPackage } from './types';

type CliPackageJson = typeof cliPkg;

declare const __non_webpack_require__: typeof require;

const registryTypes = new Set(['version', 'tag', 'range']);

const createStaticBuilder = (scope: string): BuilderWithPackage => {
  return {
    runInProcess: true,
    requirePath: `${scope}/static`,
    builder: Object.freeze(staticBuilder),
    package: Object.freeze({ name: `@${scope}/static`, version: '' }),
  };
};

const localBuilders: { [key: string]: BuilderWithPackage } = {
  '@now/static': createStaticBuilder('now'),
  '@vercel/static': createStaticBuilder('vercel'),
};

const distTag = getDistTag(cliPkg.version);

export const cacheDirPromise = prepareCacheDir();
export const builderDirPromise = prepareBuilderDir();

/**
 * Prepare cache directory for installing Vercel runtimes.
 */
export async function prepareCacheDir() {
  const designated = XDGAppPaths('com.vercel.cli').cache();

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

export function getBuildUtils(packages: string[], org: string): string {
  const version = packages
    .map(getNpmVersion)
    .some(ver => ver.includes('canary'))
    ? 'canary'
    : 'latest';

  return `@${org}/build-utils@${version}`;
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
  cliPkg: CliPackageJson
) {
  if (builderSpec in localBuilders) return false;
  const parsed = npa(builderSpec);
  const parsedVersion = parseVersionSafe(parsed.rawSpec);

  // Skip install of Runtimes that are part of Vercel CLI's `dependencies`
  if (isBundledBuilder(parsed, cliPkg)) {
    return false;
  }

  // Skip install of already installed Runtime with exact version match
  if (
    parsed.name &&
    parsed.type === 'version' &&
    parsedVersion &&
    buildersPkg.dependencies &&
    parsedVersion.version == buildersPkg.dependencies[parsed.name]
  ) {
    return false;
  }

  // Skip install of already installed Runtime with tag compatible match
  if (
    parsed.name &&
    parsed.type === 'tag' &&
    parsed.fetchSpec === distTag &&
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

  // Filter out any packages that come packaged with Vercel CLI
  const packagesToInstall = packages.filter(p =>
    filterPackage(p, distTag, buildersPkgBefore, cliPkg)
  );

  if (packagesToInstall.length === 0) {
    output.debug('No Runtimes need to be installed');
    return;
  }

  packagesToInstall.push(
    getBuildUtils(packages, 'vercel'),
    getBuildUtils(packages, 'now')
  );

  await npmInstall(builderDir, output, packagesToInstall, false);

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

async function npmInstall(
  cwd: string,
  output: Output,
  packagesToInstall: string[],
  silent: boolean
) {
  const sortedPackages = packagesToInstall.sort();

  if (!silent) {
    output.spinner(
      `Installing ${pluralize(
        'Runtime',
        sortedPackages.length
      )}: ${sortedPackages.join(', ')}`
    );
  }

  output.debug(`Running npm install in ${cwd}`);

  try {
    const args = [
      'install',
      '--save-exact',
      '--no-package-lock',
      '--no-audit',
      '--no-progress',
    ];
    if (process.stderr.isTTY) {
      // Force colors in the npm child process
      // https://docs.npmjs.com/misc/config#color
      args.push('--color=always');
    }
    args.push(...sortedPackages);
    const result = await execa('npm', args, {
      cwd,
      reject: false,
      stdio: output.isDebugEnabled() ? 'inherit' : 'pipe',
    });
    if (result.failed) {
      output.stopSpinner();
      if (result.stdout) {
        console.log(result.stdout);
      }
      if (result.stderr) {
        console.error(result.stderr);
      }
      throw new NowBuildError({
        message:
          (result as any).code === 'ENOENT'
            ? `Command not found: ${chalk.cyan(
                'npm'
              )}\nPlease ensure that ${cmd('npm')} is properly installed`
            : 'Failed to install `vercel dev` dependencies',
        code: 'NPM_INSTALL_ERROR',
        link: 'https://vercel.link/npm-install-failed-dev',
      });
    }
  } finally {
    output.stopSpinner();
  }
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

    // If it's a builder that is part of Vercel CLI's
    // `dependencies` then don't update it
    if (isBundledBuilder(npa(p), cliPkg)) {
      return false;
    }

    return true;
  });

  if (packagesToUpdate.length > 0) {
    packagesToUpdate.push(
      getBuildUtils(packages, 'vercel'),
      getBuildUtils(packages, 'now')
    );

    await npmInstall(builderDir, output, packagesToUpdate, true);

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

    // First check if it's a bundled Runtime in Vercel CLI's `node_modules`
    const bundledBuilder = isBundledBuilder(parsed, cliPkg);
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
  { dependencies = {} }: PackageJson
): boolean {
  if (!parsed.name) {
    return false;
  }

  const bundledVersion = dependencies[parsed.name];
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
  const deps: PackageJson.DependencyMap = {
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
