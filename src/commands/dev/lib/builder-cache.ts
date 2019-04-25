import chalk from 'chalk';
import execa from 'execa';
import { createHash } from 'crypto';
import { join, resolve } from 'path';
import npa from 'npm-package-arg';
import mkdirp from 'mkdirp-promise';
import { funCacheDir } from '@zeit/fun';
import cacheDirectory from 'cache-or-tmp-directory';
import { readFile, writeFile, readJSON, writeJSON, remove } from 'fs-extra';

import * as staticBuilder from './static-builder';
import { BuilderWithPackage } from './types';
import wait from '../../../util/output/wait';
import { Output } from '../../../util/output';
import { devDependencies as nowCliDeps } from '../../../../package.json';
import {
  NoBuilderCacheError,
  BuilderCacheCleanError
} from '../../../util/errors-ts';

const localBuilders: { [key: string]: BuilderWithPackage } = {
  '@now/static': {
    runInProcess: true,
    builder: Object.freeze(staticBuilder),
    package: { version: '' }
  }
};

export const cacheDirPromise = prepareCacheDir();
export const builderDirPromise = prepareBuilderDir();
export const builderModulePathPromise = prepareBuilderModulePath();

/**
 * Prepare cache directory for installing now-builders
 */
export async function prepareCacheDir() {
  const { NOW_BUILDER_CACHE_DIR } = process.env;
  const designated = NOW_BUILDER_CACHE_DIR
    ? resolve(NOW_BUILDER_CACHE_DIR)
    : cacheDirectory('co.zeit.now');

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

  // Create an empty private `package.json`,
  // but only if one does not already exist
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

export async function prepareBuilderModulePath() {
  const [builderDir, builderContents] = await Promise.all([
    builderDirPromise,
    readFile(join(__dirname, 'builder.js'))
  ]);
  let needsWrite = false;
  const builderSha = getSha(builderContents);
  const cachedBuilderPath = join(builderDir, 'builder.js');

  try {
    const cachedBuilderContents = await readFile(cachedBuilderPath);
    const cachedBuilderSha = getSha(cachedBuilderContents);
    if (builderSha !== cachedBuilderSha) {
      needsWrite = true;
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      needsWrite = true;
    } else {
      throw err;
    }
  }

  if (needsWrite) {
    await writeFile(cachedBuilderPath, builderContents);
  }

  return cachedBuilderPath;
}

// Is responsible for cleaning the cache
export async function cleanCacheDir(output: Output): Promise<void> {
  const cacheDir = await cacheDirPromise;
  try {
    output.log(chalk`{magenta Deleting} ${cacheDir}`);
    await remove(cacheDir);
  } catch (err) {
    throw new BuilderCacheCleanError(cacheDir, err.message);
  }

  try {
    await remove(funCacheDir);
    output.log(chalk`{magenta Deleting} ${funCacheDir}`);
  } catch (err) {
    throw new BuilderCacheCleanError(funCacheDir, err.message);
  }
}

/**
 * Install a list of builders to the cache directory.
 */
export async function installBuilders(
  packages: string[],
  update: boolean = false
): Promise<void> {
  if (
    packages.length === 1 &&
    Object.hasOwnProperty.call(localBuilders, packages[0])
  ) {
    // Static deployment, no builders to install
    return;
  }
  const cacheDir = await builderDirPromise;
  const buildersPkg = join(cacheDir, 'package.json');
  const pkg = await readJSON(buildersPkg);
  const updatedPackages: string[] = [];

  if (!pkg.devDependencies) {
    pkg.devDependencies = {};
  }
  const deps = pkg.devDependencies;

  for (const builderPkg of packages) {
    const parsed = npa(builderPkg);
    const name = parsed.name || builderPkg;
    if (Object.hasOwnProperty.call(localBuilders, name)) {
      continue;
    }
    const spec = parsed.rawSpec || parsed.fetchSpec || 'latest';
    const currentVersion = deps[name];
    if (currentVersion !== spec) {
      updatedPackages.push(builderPkg);
      deps[name] = spec;
    }
  }

  // Pull the same version of `@now/build-utils` that now-cli is using
  const buildUtils = '@now/build-utils';
  const buildUtilsVersion = nowCliDeps[buildUtils];
  if (deps[buildUtils] !== buildUtilsVersion) {
    updatedPackages.push(`${buildUtils}@${buildUtilsVersion}`);
    deps[buildUtils] = buildUtilsVersion;
  }

  if (updatedPackages.length > 0) {
    const stopSpinner = wait(
      `Installing builders: ${updatedPackages.join(', ')}`
    );
    try {
      await writeJSON(buildersPkg, pkg);
      await execa('npm', ['install'], {
        cwd: cacheDir
      });
    } finally {
      stopSpinner();
    }
  }

  if (update) {
    const stopSpinner = wait('Checking for builder updates');
    await execa('npm', ['update'], {
      reject: false,
      cwd: cacheDir
    });
    stopSpinner();
  }
}

/**
 * Get a builder from the cache directory.
 */
export async function getBuilder(
  builderPkg: string
): Promise<BuilderWithPackage> {
  let builderWithPkg: BuilderWithPackage = localBuilders[builderPkg];
  if (!builderWithPkg) {
    const cacheDir = await builderDirPromise;
    const parsed = npa(builderPkg);
    const dest = join(cacheDir, 'node_modules', parsed.name || builderPkg);
    const mod = require(dest);
    const pkg = require(join(dest, 'package.json'));
    builderWithPkg = Object.freeze({
      builder: mod,
      package: pkg
    });
  }
  return builderWithPkg;
}

function getSha(buffer: Buffer): string {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}
