import type { AuthConfig, CredStorage, GlobalConfig } from './types';
import { CRED_STORAGE_CONFIG_VALUES, DEFAULT_CRED_STORAGE } from './types';
import {
  getAuthConfigFilePath,
  getConfigFilePath,
  readAuthConfigFile,
  readGlobalConfigFile,
} from './cli-config';

const TOKEN_STORAGE_ENV = 'VERCEL_TOKEN_STORAGE';

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isCredStorage(value: unknown): value is CredStorage {
  return CRED_STORAGE_CONFIG_VALUES.includes(value as CredStorage);
}

function formatCredStorageError(value: unknown, source: string): string {
  return `Invalid value for \`${source}\`: ${JSON.stringify(value)}. Expected one of: ${CRED_STORAGE_CONFIG_VALUES.map(storage => JSON.stringify(storage)).join(', ')}.`;
}

function parseCredStorage(
  value: unknown,
  source = 'credStorage'
): CredStorage | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (isCredStorage(value)) {
    return value;
  }

  throw new Error(formatCredStorageError(value, source));
}

export function authConfigHasUsableTokenData(
  value: unknown
): value is Pick<AuthConfig, 'token' | 'refreshToken'> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const authConfig = value as AuthConfig;

  return (
    (typeof authConfig.token === 'string' && authConfig.token.length > 0) ||
    (typeof authConfig.refreshToken === 'string' &&
      authConfig.refreshToken.length > 0)
  );
}

function getLikelyAutoCredStorage(configDir: string): CredStorage {
  try {
    return authConfigHasUsableTokenData(
      readAuthConfigFile(getAuthConfigFilePath(configDir))
    )
      ? 'file'
      : 'keyring';
  } catch {
    return 'keyring';
  }
}

function getLikelyConfiguredCredStorage(
  configDir: string,
  credStorage: CredStorage | undefined
): CredStorage {
  if (credStorage === 'keyring') {
    return 'keyring';
  }

  if (credStorage !== 'auto') {
    return DEFAULT_CRED_STORAGE;
  }

  return getLikelyAutoCredStorage(configDir);
}

export function getLikelyEffectiveCredStorage(configDir: string): CredStorage {
  let config: GlobalConfig = {};
  const credStorageOverride = process.env[TOKEN_STORAGE_ENV];

  if (typeof credStorageOverride !== 'undefined') {
    return getLikelyConfiguredCredStorage(
      configDir,
      parseCredStorage(credStorageOverride, TOKEN_STORAGE_ENV)
    );
  }

  try {
    const parsed = readGlobalConfigFile(getConfigFilePath(configDir));
    config = {
      ...parsed,
      credStorage: parseCredStorage(parsed.credStorage),
    };
  } catch (error) {
    if (!(isErrnoException(error) && error.code === 'ENOENT')) {
      throw error;
    }
  }

  return getLikelyConfiguredCredStorage(configDir, config.credStorage);
}
