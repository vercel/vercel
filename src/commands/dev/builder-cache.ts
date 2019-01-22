import fs from 'fs';
import path from 'path';
import execa from 'execa';
import mkdirp from 'mkdirp';
// @ts-ignore
import cacheDirectory from 'cache-or-tmp-directory';
import { NowError } from '../../util/now-error';

import staticBuilder from './static-builder';

export default {
  prepare,
  install,
  get
};

const localBuilders: { [key: string]: any } = {
  '@now/statics': staticBuilder
};

/**
 * Prepare cache directory for installing now-builders
 */
function prepare() {
  try {
    const designated = cacheDirectory('co.zeit.now-builders');
    const buildersPkg = path.join(designated, 'package.json');

    if (designated) {
      if (fs.lstatSync(designated).isDirectory()) {
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
 * @param cacheDir directory
 * @param name builder's name
 */
async function install(cacheDir: string, name: string) {
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
 * @param cacheDir directory
 * @param name builder's name
 */
function get(cacheDir: string, name: string) {
  if (localBuilders.hasOwnProperty(name)) {
    return localBuilders[name];
  }

  const dest = path.join(cacheDir, 'node_modules', name);
  return require(dest);
}
