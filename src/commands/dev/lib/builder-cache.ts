import fs from 'fs';
import path from 'path';
import execa from 'execa';
import mkdirp from 'mkdirp';
import npa from 'npm-package-arg';
import cacheDirectory from 'cache-or-tmp-directory';
import { NowError } from '../../../util/now-error';

import * as staticBuilder from './static-builder';

const localBuilders: { [key: string]: any } = {
  '@now/static': staticBuilder
};

const cacheDir = prepare();

/**
 * Prepare cache directory for installing now-builders
 */
export function prepare() {
  try {
    const designated = cacheDirectory('co.zeit.now-builders');

    if (!designated) {
      throw new Error('Could not determine location of cache directory');
    }

    const buildersPkg = path.join(designated, 'package.json');

    if (designated) {
      if (fs.existsSync(designated)) {
        return designated;
      }

      mkdirp.sync(designated);
      fs.writeFileSync(buildersPkg, '{"private":true}');

      return designated;
    } else {
      throw new NowError({
        code: 'NO_BUILDER_CACHE_DIR',
        message: 'Could not find cache directory for now-builders.',
        meta: {}
      });
    }
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

  const dest = path.join(cacheDir, 'node_modules', name);
  if (!fs.existsSync(dest)) {
    return execa('npm', ['install', name, '--prefer-offline'], {
      cwd: cacheDir
    });
  }
}

/**
 * Get a builder from cache directory
 */
export function getBuilder(builderPkg: string) {
  if (localBuilders.hasOwnProperty(builderPkg)) {
    return localBuilders[builderPkg];
  }

  const parsed = npa(builderPkg);
  const dest = path.join(cacheDir, 'node_modules', parsed.name || builderPkg);
  return require(dest);
}
