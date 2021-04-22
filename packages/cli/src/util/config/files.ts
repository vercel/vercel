import { join, basename } from 'path';
import loadJSON from 'load-json-file';
import writeJSON from 'write-json-file';
import { existsSync } from 'fs';
import { fileNameSymbol } from '@vercel/client';
import getGlobalPathConfig from './global-path';
import getLocalPathConfig from './local-path';
import { NowError } from '../now-error';
import error from '../output/error';
import highlight from '../output/highlight';
import { NowConfig } from '../dev/types';
import { AuthConfig, GlobalConfig } from '../../types';

const VERCEL_DIR = getGlobalPathConfig();
const CONFIG_FILE_PATH = join(VERCEL_DIR, 'config.json');
const AUTH_CONFIG_FILE_PATH = join(VERCEL_DIR, 'auth.json');

// reads "global config" file atomically
export const readConfigFile = (): GlobalConfig => {
  const config = loadJSON.sync(CONFIG_FILE_PATH);
  return config;
};

// writes whatever's in `stuff` to "global config" file, atomically
export const writeToConfigFile = (stuff: GlobalConfig): void => {
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

// reads "auth config" file atomically
export const readAuthConfigFile = (): AuthConfig => {
  const config = loadJSON.sync(AUTH_CONFIG_FILE_PATH);
  return config;
};

// writes whatever's in `stuff` to "auth config" file, atomically
export const writeToAuthConfigFile = (stuff: AuthConfig) => {
  try {
    return writeJSON.sync(AUTH_CONFIG_FILE_PATH, stuff, {
      indent: 2,
      mode: 0o600,
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

export function readLocalConfig(
  prefix: string = process.cwd()
): NowConfig | null {
  let config: NowConfig | null = null;
  let target = '';

  try {
    target = getLocalPathConfig(prefix);
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

  try {
    if (existsSync(target)) {
      config = loadJSON.sync(target);
    }
  } catch (err) {
    if (err.name === 'JSONError') {
      console.error(error(err.message));
    } else {
      const code = err.code ? ` (${err.code})` : '';
      console.error(error(`Failed to read config file: ${target}${code}`));
    }
    process.exit(1);
  }

  if (!config) {
    return null;
  }

  config[fileNameSymbol] = basename(target);
  return config;
}
