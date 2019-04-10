import chalk from 'chalk';
import execa from 'execa';
import { join } from 'path';
import npa from 'npm-package-arg';
import mkdirp from 'mkdirp-promise';
import { funCacheDir } from '@zeit/fun';
import { readJSON, writeJSON, remove } from 'fs-extra';
import cacheDirectory from 'cache-or-tmp-directory';
import wait from '../../../util/output/wait';
import { Output } from '../../../util/output';
import { devDependencies as nowCliDeps } from '../../../../package.json';
import { Builder, PACKAGE } from './types';
import {
  NoBuilderCacheError,
  BuilderCacheCleanError
} from '../../../util/errors-ts';

import * as _staticBuilder from './static-builder';
const staticBuilder: Builder = _staticBuilder;
staticBuilder[PACKAGE] = {
  version: 'built-in'
};

const localBuilders: { [key: string]: Builder } = {
  '@now/static': staticBuilder
};

export const cacheDirPromise = prepareCacheDir();
export const builderDirPromise = prepareBuilderDir();

/**
 * Prepare cache directory for installing now-builders
 */
export async function prepareCacheDir() {
  const designated = cacheDirectory('co.zeit.now');

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
export async function installBuilders(packages: string[]): Promise<void> {
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
    if (localBuilders.hasOwnProperty(name)) {
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

  const stopSpinner = wait('Checking for builder updates');
  await execa('npm', ['update'], {
    reject: false,
    cwd: cacheDir
  });
  stopSpinner();
}

/**
 * Get a builder from the cache directory.
 */
export async function getBuilder(builderPkg: string): Promise<Builder> {
  let builder: Builder = localBuilders[builderPkg];
  if (!builder) {
    const cacheDir = await builderDirPromise;
    const parsed = npa(builderPkg);
    const dest = join(cacheDir, 'node_modules', parsed.name || builderPkg);
    builder = require(dest);
    builder[PACKAGE] = require(join(dest, 'package.json'));
  }
  return builder;
}
