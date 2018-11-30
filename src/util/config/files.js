// Native
import { join as joinPath } from 'path';

// Packages
import loadJSON from 'load-json-file';

import writeJSON from 'write-json-file';
import { existsSync } from 'fs';

// Utilities
import getNowDir from './global-path';

import getLocalPathConfig from './local-path';
import error from '../output/error';

const NOW_DIR = getNowDir();
const CONFIG_FILE_PATH = joinPath(NOW_DIR, 'config.json');
const AUTH_CONFIG_FILE_PATH = joinPath(NOW_DIR, 'auth.json');

// reads `CONFIG_FILE_PATH` atomically
export const readConfigFile = () => loadJSON.sync(CONFIG_FILE_PATH);

// writes whatever's in `stuff` to `CONFIG_FILE_PATH`, atomically
export const writeToConfigFile = stuff =>
  writeJSON.sync(CONFIG_FILE_PATH, stuff, { indent: 2 });

// reads `AUTH_CONFIG_FILE_PATH` atomically
export const readAuthConfigFile = () => loadJSON.sync(AUTH_CONFIG_FILE_PATH);

// writes whatever's in `stuff` to `AUTH_CONFIG_FILE_PATH`, atomically
export const writeToAuthConfigFile = stuff =>
  writeJSON.sync(AUTH_CONFIG_FILE_PATH, stuff, { indent: 2, mode: 0o600 });

export function getConfigFilePath() {
  return CONFIG_FILE_PATH;
}

export function getAuthConfigFilePath() {
  return AUTH_CONFIG_FILE_PATH;
}

export function readLocalConfig(prefix) {
  const target = getLocalPathConfig(prefix || process.cwd());
  let localConfigExists;

  try {
    localConfigExists = existsSync(target);
  } catch (err) {
    console.error(error('Failed to check if `now.json` exists'));
    process.exit(1);
  }

  if (localConfigExists) {
    try {
      return loadJSON.sync(target);
    } catch (err) {
      if (err.name === 'JSONError') {
        console.log(error(err.message));
      } else {
        const code = err.code ? `(${err.code})` : '';
        console.error(error(`Failed to read the \`now.json\` file ${code}`));
      }

      process.exit(1);
    }
  }

  return null;
}
