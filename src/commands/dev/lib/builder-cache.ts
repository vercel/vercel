import execa from 'execa';
import { join } from 'path';
import npa from 'npm-package-arg';
import mkdirp from 'mkdirp-promise';
import { promises as fs } from 'fs';
import cacheDirectory from 'cache-or-tmp-directory';
import { NowError } from '../../../util/now-error';
import { Builder } from './types';

import * as staticBuilder from './static-builder';

const localBuilders: { [key: string]: Builder } = {
  '@now/static': staticBuilder
};

const cacheDirPromise = prepare();

async function exists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    } else {
      throw err;
    }
  }
}

/**
 * Prepare cache directory for installing now-builders
 */
export async function prepare() {
  try {
    const designated = cacheDirectory('co.zeit.now');

    if (!designated) {
      throw new NowError({
        code: 'NO_BUILDER_CACHE_DIR',
        message: 'Could not find cache directory for now-builders.',
        meta: {}
      });
    }

    const cacheDir = join(designated, 'dev/builders');
    await mkdirp(cacheDir);

    const buildersPkg = join(cacheDir, 'package.json');
    if (!(await exists(buildersPkg))) {
      await fs.writeFile(buildersPkg, '{"private":true}');
    }

    return cacheDir;
  } catch (error) {
    throw new NowError({
      code: 'BUILDER_CACHE_CREATION_FAILURE',
      message: 'Could not create cache directory for now-builders.',
      meta: error.stack
    });
  }
}

/**
 * Install a builder to cache directory
 */
export async function installBuilder(name: string) {
  if (localBuilders.hasOwnProperty(name)) {
    return;
  }

  const cacheDir = await cacheDirPromise;
  const dest = join(cacheDir, 'node_modules', name);
  if (!(await exists(dest))) {
    return execa('npm', ['install', name, '--prefer-offline'], {
      cwd: cacheDir
    });
  }
}

/**
 * Get a builder from cache directory
 */
export async function getBuilder(builderPkg: string): Promise<Builder> {
  if (localBuilders.hasOwnProperty(builderPkg)) {
    return localBuilders[builderPkg];
  }

  const cacheDir = await cacheDirPromise;
  const parsed = npa(builderPkg);
  const dest = join(cacheDir, 'node_modules', parsed.name || builderPkg);
  return require(dest);
}
