import { join as joinPath } from 'path';
import loadJSON from 'load-json-file';
import writeJSON from 'write-json-file';
import { existsSync } from 'fs';
import getNowDir from './global-path';
import getLocalPathConfig from './local-path';
import { NowError } from '../now-error';
import error from '../output/error';
import highlight from '../output/highlight';

const NOW_DIR = getNowDir();
const CONFIG_FILE_PATH = joinPath(NOW_DIR, 'config.json');
const AUTH_CONFIG_FILE_PATH = joinPath(NOW_DIR, 'auth.json');

// reads `CONFIG_FILE_PATH` atomically
export const readConfigFile = () => loadJSON.sync(CONFIG_FILE_PATH);

// writes whatever's in `stuff` to `CONFIG_FILE_PATH`, atomically
export const writeToConfigFile = (stuff: object) => {
  try {
    return writeJSON.sync(CONFIG_FILE_PATH, stuff, { indent: 2 });
  } catch (err) {
    if (err.code === 'EPERM') {
      console.error(
        error(
          `Not able to create ${highlight(
            CONFIG_FILE_PATH
          )} (operation not permitted).`
        )
      );
      process.exit(1);
    } else if (err.code === 'EBADF') {
      console.error(
        error(
          `Not able to create ${highlight(
            CONFIG_FILE_PATH
          )} (bad file descriptor).`
        )
      );
      process.exit(1);
    }

    throw err;
  }
};

// reads `AUTH_CONFIG_FILE_PATH` atomically
export const readAuthConfigFile = () => loadJSON.sync(AUTH_CONFIG_FILE_PATH);

// writes whatever's in `stuff` to `AUTH_CONFIG_FILE_PATH`, atomically
export const writeToAuthConfigFile = (stuff: object) => {
  try {
    return writeJSON.sync(AUTH_CONFIG_FILE_PATH, stuff, {
      indent: 2,
      mode: 0o600
    });
  } catch (err) {
    if (err.code === 'EPERM') {
      console.error(
        error(
          `Not able to create ${highlight(
            AUTH_CONFIG_FILE_PATH
          )} (operation not permitted).`
        )
      );
      process.exit(1);
    } else if (err.code === 'EBADF') {
      console.error(
        error(
          `Not able to create ${highlight(
            AUTH_CONFIG_FILE_PATH
          )} (bad file descriptor).`
        )
      );
      process.exit(1);
    }

    throw err;
  }
};

export function getConfigFilePath() {
  return CONFIG_FILE_PATH;
}

export function getAuthConfigFilePath() {
  return AUTH_CONFIG_FILE_PATH;
}

export function readLocalConfig(prefix: string = process.cwd()) {
  let target = '';

  try {
    target = getLocalPathConfig(prefix || process.cwd());
  } catch (err) {
    if (err instanceof NowError) {
      console.error(error(err.message));
      process.exit(1);
    } else {
      throw err;
    }
  }

  if (!target) {
    return null;
  }

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
