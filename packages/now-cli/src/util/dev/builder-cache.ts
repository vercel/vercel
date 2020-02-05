import execa from 'execa';
import semver from 'semver';
import pipe from 'promisepipe';
import retry from 'async-retry';
import npa from 'npm-package-arg';
import pluralize from 'pluralize';
import { extract } from 'tar-fs';
import { createHash } from 'crypto';
import { createGunzip } from 'zlib';
import { join, resolve } from 'path';
import { PackageJson } from '@now/build-utils';
import XDGAppPaths from 'xdg-app-paths';
import {
  createReadStream,
  mkdirp,
  readFile,
  readJSON,
  writeFile,
} from 'fs-extra';
import pkg from '../../../package.json';

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
    builder: Object.freeze(staticBuilder),
    package: Object.freeze({ name: '@now/static', version: '' }),
  },
};

const distTag = getDistTag(pkg.version);

export const cacheDirPromise = prepareCacheDir();
export const builderDirPromise = prepareBuilderDir();
export const builderModulePathPromise = prepareBuilderModulePath();

function readFileOrNull(
  filePath: string,
  encoding?: null
): Promise<Buffer | null>;
function readFileOrNull(
  filePath: string,
  encoding: string
): Promise<string | null>;
async function readFileOrNull(
  filePath: string,
  encoding?: string | null
): Promise<Buffer | string | null> {
  try {
    if (encoding) {
      return await readFile(filePath, encoding);
    }
    return await readFile(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

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

  // Extract the bundled `builders.tar.gz` file, if necessary
  const bundledTarballPath = join(__dirname, '../../../assets/builders.tar.gz');

  const existingPackageJson =
    (await readFileOrNull(join(builderDir, 'package.json'), 'utf8')) || '{}';
  const { dependencies = {} } = JSON.parse(existingPackageJson);

  if (!hasBundledBuilders(dependencies)) {
    const extractor = extract(builderDir);
    await pipe(
      createReadStream(bundledTarballPath),
      createGunzip(),
      extractor
    );
  }

  return builderDir;
}

export async function prepareBuilderModulePath() {
  const [builderDir, builderContents] = await Promise.all([
    builderDirPromise,
    readFile(join(__dirname, 'builder-worker.js')),
  ]);
  let needsWrite = false;
  const builderSha = getSha(builderContents);
  const cachedBuilderPath = join(builderDir, 'builder.js');

  const cachedBuilderContents = await readFileOrNull(cachedBuilderPath);
  if (cachedBuilderContents) {
    const cachedBuilderSha = getSha(cachedBuilderContents);
    if (builderSha !== cachedBuilderSha) {
      needsWrite = true;
    }
  } else {
    needsWrite = true;
  }

  if (needsWrite) {
    await writeFile(cachedBuilderPath, builderContents);
  }

  return cachedBuilderPath;
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
  buildersPkg: PackageJson
) {
  if (builderSpec in localBuilders) return false;
  const parsed = npa(builderSpec);
  const parsedVersion = parseVersionSafe(parsed.rawSpec);
  // skip install of already installed Runtime
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
  yarnDir: string,
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
  const yarnPath = join(yarnDir, 'yarn');
  const buildersPkgPath = join(builderDir, 'package.json');
  const buildersPkgBefore = await readJSON(buildersPkgPath);

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
          process.execPath,
          [
            yarnPath,
            'add',
            '--exact',
            '--no-lockfile',
            '--non-interactive',
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
  for (const [name, version] of Object.entries(buildersPkgAfter.dependencies)) {
    if (version !== buildersPkgBefore.dependencies[name]) {
      output.debug(`Runtime "${name}" updated to version \`${version}\``);
      updatedPackages.push(name);
    }
  }

  purgeRequireCache(updatedPackages, builderDir, output);
}

export async function updateBuilders(
  packagesSet: Set<string>,
  yarnDir: string,
  output: Output,
  builderDir?: string
): Promise<string[]> {
  if (!builderDir) {
    builderDir = await builderDirPromise;
  }

  const packages = Array.from(packagesSet);
  const yarnPath = join(yarnDir, 'yarn');
  const buildersPkgPath = join(builderDir, 'package.json');
  const buildersPkgBefore = await readJSON(buildersPkgPath);

  packages.push(getBuildUtils(packages));

  await retry(
    () =>
      execa(
        process.execPath,
        [
          yarnPath,
          'add',
          '--exact',
          '--no-lockfile',
          '--non-interactive',
          ...packages.filter(p => p !== '@now/static'),
        ],
        {
          cwd: builderDir,
        }
      ),
    { retries: 2 }
  );

  const updatedPackages: string[] = [];
  const buildersPkgAfter = await readJSON(buildersPkgPath);
  for (const [name, version] of Object.entries(buildersPkgAfter.dependencies)) {
    if (version !== buildersPkgBefore.dependencies[name]) {
      output.debug(`Runtime "${name}" updated to version \`${version}\``);
      updatedPackages.push(name);
    }
  }

  purgeRequireCache(updatedPackages, builderDir, output);

  return updatedPackages;
}

/**
 * Get a builder from the cache directory.
 */
export async function getBuilder(
  builderPkg: string,
  yarnDir: string,
  output: Output,
  builderDir?: string
): Promise<BuilderWithPackage> {
  let builderWithPkg: BuilderWithPackage = localBuilders[builderPkg];
  if (!builderWithPkg) {
    if (!builderDir) {
      builderDir = await builderDirPromise;
    }
    const parsed = npa(builderPkg);
    const buildersPkg = await readJSON(join(builderDir, 'package.json'));
    const pkgName = getPackageName(parsed, buildersPkg) || builderPkg;
    const dest = join(builderDir, 'node_modules', pkgName);
    try {
      const mod = require(dest);
      const pkg = require(join(dest, 'package.json'));
      builderWithPkg = {
        builder: Object.freeze(mod),
        package: Object.freeze(pkg),
      };
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        output.debug(
          `Attempted to require ${builderPkg}, but it is not installed`
        );
        const pkgSet = new Set([builderPkg]);
        await installBuilders(pkgSet, yarnDir, output, builderDir);

        // Run `getBuilder()` again now that the builder has been installed
        return getBuilder(builderPkg, yarnDir, output, builderDir);
      }
      throw err;
    }
  }
  return builderWithPkg;
}

function getPackageName(
  parsed: npa.Result,
  buildersPkg: PackageJson
): string | null {
  if (registryTypes.has(parsed.type)) {
    return parsed.name;
  }
  const deps = { ...buildersPkg.devDependencies, ...buildersPkg.dependencies };
  for (const [name, dep] of Object.entries(deps)) {
    if (dep === parsed.raw) {
      return name;
    }
  }
  return null;
}

function getSha(buffer: Buffer): string {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

function hasBundledBuilders(dependencies: { [name: string]: string }): boolean {
  for (const name of getBundledBuilders()) {
    if (!(name in dependencies)) {
      return false;
    }
  }
  return true;
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
