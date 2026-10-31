import { join, basename, dirname } from 'path';
import loadJSON from 'load-json-file';
import { accessSync, constants } from 'fs';
import * as config from '@vercel/cli-config';
import {
  persistCliAuthConfig,
  readCliAuthConfig,
} from '@vercel/cli-auth/credentials-store.js';
import {
  errorToStringFriendly,
  isErrnoException,
  isError,
} from '@vercel/error-utils';
import { fileNameSymbol } from '@vercel/client/dist/types';
import getGlobalPathConfig from './global-path';
import getLocalPathConfig from './local-path';
import { NowError } from '../now-error';
import hp from '../humanize-path';
import highlight from '../output/highlight';
import type { VercelConfig } from '../dev/types';
import type { AuthConfig, GlobalConfig } from '@vercel-internals/types';
import { VERCEL_DIR as PROJECT_VERCEL_DIR } from '../projects/link';
import {
  VERCEL_CONFIG_EXTENSIONS,
  DEFAULT_VERCEL_CONFIG_FILENAME,
} from './constants';

import output from '../../output-manager';

// Resolved on first use rather than at import: the native build worker loads
// this module before the build's argv (and `--global-config`) is applied.
let globalDir: string | undefined;
const getVercelDir = () => (globalDir ??= getGlobalPathConfig());

// reads "global config" file atomically
export const readConfigFile = (): GlobalConfig => {
  return config.readGlobalConfigFile(getConfigFilePath());
};

// writes whatever's in `stuff` to "global config" file, atomically
export const writeToConfigFile = (stuff: GlobalConfig): void => {
  try {
    config.writeGlobalConfigFile(getConfigFilePath(), stuff);
  } catch (err: unknown) {
    if (isErrnoException(err)) {
      if (isErrnoException(err) && err.code === 'EPERM') {
        output.error(
          `Not able to create ${highlight(
            getConfigFilePath()
          )} (operation not permitted).`
        );
        process.exit(1);
      } else if (err.code === 'EBADF') {
        output.error(
          `Not able to create ${highlight(
            getConfigFilePath()
          )} (bad file descriptor).`
        );
        process.exit(1);
      }
    }

    throw err;
  }
};

export const readAuthConfigFile = (_globalConfig: GlobalConfig): AuthConfig => {
  return {
    ...config.getDefaultAuthConfig(),
    ...readCliAuthConfig(getVercelDir()),
  };
};

export const persistAuthConfig = (
  authConfig: AuthConfig,
  _globalConfig: GlobalConfig
) => {
  try {
    return persistCliAuthConfig(getVercelDir(), authConfig);
  } catch (err: unknown) {
    const wrappedError = new Error(
      `Not able to create ${hp(getAuthConfigFilePath())} (${errorToStringFriendly(
        err
      )}).`
    );
    (wrappedError as Error & { cause?: unknown }).cause = err;
    throw wrappedError;
  }
};

export function getConfigFilePath() {
  return config.getConfigFilePath(getVercelDir());
}

export function getAuthConfigFilePath() {
  return config.getAuthConfigFilePath(getVercelDir());
}

export function readLocalConfig(
  prefix: string = process.cwd()
): VercelConfig | undefined {
  let config: VercelConfig | undefined = undefined;
  let target = '';

  try {
    target = getLocalPathConfig(prefix);
  } catch (err) {
    if (err instanceof NowError) {
      output.error(err.message);
      process.exit(1);
    } else {
      throw err;
    }
  }

  if (!target) {
    return;
  }

  try {
    accessSync(target, constants.F_OK);
    config = loadJSON.sync(target);
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      // File doesn't exist, config remains undefined
    } else if (isError(err) && err.name === 'JSONError') {
      output.error(err.message);
      process.exit(1);
    } else if (isErrnoException(err)) {
      const code = err.code ? ` (${err.code})` : '';
      output.error(`Failed to read config file: ${target}${code}`);
      process.exit(1);
    } else {
      output.prettyError(err);
      process.exit(1);
    }
  }

  if (!config) {
    return;
  }

  // If reading from .vercel/vercel.json (compiled config), detect the source file
  const isCompiledConfig =
    basename(target) === 'vercel.json' &&
    basename(dirname(target)) === PROJECT_VERCEL_DIR;

  if (isCompiledConfig) {
    const workPath = dirname(dirname(target));
    let sourceFile: string | null = null;
    for (const ext of VERCEL_CONFIG_EXTENSIONS) {
      const configPath = join(workPath, `vercel.${ext}`);
      try {
        accessSync(configPath, constants.F_OK);
        sourceFile = basename(configPath);
        break;
      } catch {}
    }
    if (!sourceFile) {
      const tomlPath = join(workPath, 'vercel.toml');
      try {
        accessSync(tomlPath, constants.F_OK);
        sourceFile = 'vercel.toml';
      } catch {}
    }
    config[fileNameSymbol] = sourceFile || DEFAULT_VERCEL_CONFIG_FILENAME;
  } else {
    config[fileNameSymbol] = basename(target);
  }

  return config;
}
