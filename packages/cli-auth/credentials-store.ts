import { createHash } from 'node:crypto';
import * as cliConfig from '@vercel/cli-config';
import type {
  AuthConfig as SharedAuthConfig,
  CredStorage,
  CredentialsStorageLocation,
  GlobalConfig as SharedGlobalConfig,
} from '@vercel/cli-config';

const KEYRING_SERVICE = 'com.vercel.SharedCredentials';
const TOKEN_STORAGE_ENV = 'VERCEL_TOKEN_STORAGE';
const KEYRING_UNAVAILABLE_ENV = 'VERCEL_TEST_KEYRING_UNAVAILABLE';
const KEYRING_UNAVAILABLE_ERROR =
  'OS keyring support is unavailable. Set `credStorage` to `auto` or `file` to store credentials in auth.json instead.';

type KeyringEntry = {
  getPassword(): string | null;
  setPassword(password: string): void;
  deleteCredential(): boolean;
};

type KeyringEntryConstructor = new (
  service: string,
  account: string
) => KeyringEntry;

type LoadKeyringModule = () => {
  Entry: KeyringEntryConstructor;
};

const defaultLoadKeyringModule: LoadKeyringModule = () =>
  require('@napi-rs/keyring') as {
    Entry: KeyringEntryConstructor;
  };

let loadKeyringModule = defaultLoadKeyringModule;

type RuntimeFlags = {
  keyringUnavailableForTesting: boolean;
};

type ResolvedCliAuthConfig = RuntimeFlags & {
  credStorage: CredStorage;
};

export type GlobalConfig = Pick<SharedGlobalConfig, 'credStorage'>;

export type Credentials = Omit<SharedAuthConfig, 'tokenSource'>;

type PersistableAuthConfig = SharedAuthConfig;

function parseCredentials(value: unknown): Credentials {
  const { tokenSource, ...credentials } = cliConfig.parseAuthConfig(value);
  return credentials;
}

function formatCredStorageError(value: unknown, source: string): string {
  try {
    cliConfig.parseGlobalConfig({ credStorage: value });
  } catch (error) {
    if (error instanceof Error) {
      return error.message.replace('`credStorage`', `\`${source}\``);
    }
  }

  return `Invalid value for \`${source}\`: ${JSON.stringify(
    value
  )}. Expected one of: ${cliConfig.CRED_STORAGE_CONFIG_VALUES.map(storage => JSON.stringify(storage)).join(', ')}.`;
}

function parseCredStorage(value: unknown, source: string): CredStorage {
  if (typeof value === 'undefined') {
    return cliConfig.DEFAULT_CRED_STORAGE;
  }

  try {
    const config = cliConfig.parseGlobalConfig({ credStorage: value });

    if (config.credStorage) {
      return config.credStorage;
    }
  } catch {}

  throw new Error(formatCredStorageError(value, source));
}

export function resolveCredStorage(value: unknown): CredStorage {
  return parseCredStorage(value, 'credStorage');
}

function readRuntimeFlags(): RuntimeFlags {
  return {
    keyringUnavailableForTesting: process.env[KEYRING_UNAVAILABLE_ENV] === '1',
  };
}

function resolveCliAuthConfig(
  dir: string,
  config?: GlobalConfig
): ResolvedCliAuthConfig {
  const runtimeFlags = readRuntimeFlags();

  if (config?.credStorage) {
    return {
      ...runtimeFlags,
      credStorage: resolveCredStorage(config.credStorage),
    };
  }

  const credStorageOverride = process.env[TOKEN_STORAGE_ENV];

  if (typeof credStorageOverride !== 'undefined') {
    return {
      ...runtimeFlags,
      credStorage: parseCredStorage(credStorageOverride, TOKEN_STORAGE_ENV),
    };
  }

  return {
    ...runtimeFlags,
    credStorage: resolveCredStorage(readGlobalConfig(dir).credStorage),
  };
}

export function readGlobalConfig(dir: string): GlobalConfig {
  const configPath = cliConfig.getConfigFilePath(dir);

  try {
    const config = cliConfig.readGlobalConfigFile(configPath);

    return {
      credStorage:
        typeof config.credStorage === 'undefined'
          ? undefined
          : resolveCredStorage(config.credStorage),
    };
  } catch (error) {
    if (isENOENTError(error)) {
      return {};
    }

    throw error;
  }
}

export function getCredStorage(
  dir: string,
  config?: GlobalConfig
): CredStorage {
  return resolveCliAuthConfig(dir, config).credStorage;
}

export function resolveEffectiveCredStorage(
  dir: string,
  config?: GlobalConfig
): CredentialsStorageLocation {
  const cliAuthConfig = resolveCliAuthConfig(dir, config);

  switch (cliAuthConfig.credStorage) {
    case 'file':
      return 'file';
    case 'keyring':
      return 'keyring';
    case 'auto':
      try {
        createKeyringEntry(cliConfig.getAuthConfigFilePath(dir), cliAuthConfig);
        return 'keyring';
      } catch {
        return 'file';
      }
  }
}

function getKeyringAccount(configPath: string): string {
  const digest = createHash('sha256').update(configPath).digest('hex');
  return `cli:${digest.slice(0, 16)}`;
}

export function setLoadKeyringModuleForTesting(
  nextLoadKeyringModule?: LoadKeyringModule
) {
  loadKeyringModule = nextLoadKeyringModule ?? defaultLoadKeyringModule;
}

function createKeyringEntry(
  configPath: string,
  runtimeFlags: RuntimeFlags
): KeyringEntry {
  try {
    if (runtimeFlags.keyringUnavailableForTesting) {
      throw new Error(`${KEYRING_UNAVAILABLE_ENV} is set`);
    }

    const { Entry } = loadKeyringModule();

    return new Entry(KEYRING_SERVICE, getKeyringAccount(configPath));
  } catch (error) {
    const wrappedError = new Error(KEYRING_UNAVAILABLE_ERROR);
    (wrappedError as Error & { cause?: unknown }).cause = error;
    throw wrappedError;
  }
}

function isKeyringUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.message === KEYRING_UNAVAILABLE_ERROR;
}

function readCredentialsFromFile(configPath: string): Credentials {
  return cliConfig.readAuthFileConfig(configPath);
}

function isENOENTError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function createMissingCredentialsError(configPath: string): Error {
  const error = new Error(
    `ENOENT: no such file or directory, open '${configPath}'`
  );
  Object.assign(error, { code: 'ENOENT' });
  return error;
}

function writeCredentialsToFile(configPath: string, config: Credentials): void {
  cliConfig.writeAuthConfigFile(configPath, config);
}

function readCredentialsFromKeyring(
  configPath: string,
  runtimeFlags: RuntimeFlags
): Credentials | null {
  const entry = createKeyringEntry(configPath, runtimeFlags);
  const value = entry.getPassword();

  if (value === null) {
    return null;
  }

  return parseCredentials(JSON.parse(value));
}

function writeCredentialsToKeyring(
  configPath: string,
  config: Credentials,
  runtimeFlags: RuntimeFlags
): void {
  const entry = createKeyringEntry(configPath, runtimeFlags);
  entry.setPassword(JSON.stringify(config));
}

function deleteCredentialsFromKeyring(
  configPath: string,
  runtimeFlags: RuntimeFlags
): boolean {
  const entry = createKeyringEntry(configPath, runtimeFlags);
  return entry.deleteCredential();
}

function deleteCredentialsFile(configPath: string): void {
  cliConfig.deleteAuthConfigFile(configPath);
}

function tryDeleteCredentialsFromKeyring(
  configPath: string,
  runtimeFlags: RuntimeFlags
): void {
  try {
    deleteCredentialsFromKeyring(configPath, runtimeFlags);
  } catch {}
}

function deleteCredentialsFromKeyringIfAvailable(
  configPath: string,
  runtimeFlags: RuntimeFlags
): void {
  try {
    deleteCredentialsFromKeyring(configPath, runtimeFlags);
  } catch (error) {
    if (!isKeyringUnavailableError(error)) {
      throw error;
    }
  }
}

function migrateCredentialsToFile(
  configPath: string,
  credentials: Credentials,
  runtimeFlags: RuntimeFlags
): Credentials {
  writeCredentialsToFile(configPath, credentials);
  tryDeleteCredentialsFromKeyring(configPath, runtimeFlags);
  return credentials;
}

function tryReadKeyringCredentialsIntoFile(
  configPath: string,
  runtimeFlags: RuntimeFlags
): Credentials | null {
  try {
    const credentials = readCredentialsFromKeyring(configPath, runtimeFlags);

    if (credentials === null) {
      return null;
    }

    return migrateCredentialsToFile(configPath, credentials, runtimeFlags);
  } catch {
    return null;
  }
}

function readFileStorageCredentials(
  configPath: string,
  runtimeFlags: RuntimeFlags
): Credentials {
  try {
    const credentials = readCredentialsFromFile(configPath);

    if (cliConfig.authConfigHasUsableTokenData(credentials)) {
      return credentials;
    }

    return (
      tryReadKeyringCredentialsIntoFile(configPath, runtimeFlags) ?? credentials
    );
  } catch (error) {
    if (!isENOENTError(error)) {
      throw error;
    }

    const credentials = tryReadKeyringCredentialsIntoFile(
      configPath,
      runtimeFlags
    );

    if (credentials !== null) {
      return credentials;
    }

    throw error;
  }
}

function migrateCredentialsToKeyring(
  configPath: string,
  credentials: Credentials,
  runtimeFlags: RuntimeFlags
): Credentials {
  writeCredentialsToKeyring(configPath, credentials, runtimeFlags);
  deleteCredentialsFile(configPath);
  return credentials;
}

function readKeyringStorageCredentials(
  configPath: string,
  runtimeFlags: RuntimeFlags
): Credentials {
  const credentials = readCredentialsFromKeyring(configPath, runtimeFlags);

  if (credentials !== null) {
    return credentials;
  }

  try {
    const fileCredentials = readCredentialsFromFile(configPath);

    return migrateCredentialsToKeyring(
      configPath,
      fileCredentials,
      runtimeFlags
    );
  } catch (error) {
    if (isENOENTError(error)) {
      throw createMissingCredentialsError(configPath);
    }

    throw error;
  }
}

function readAutoStorageCredentials(
  configPath: string,
  runtimeFlags: RuntimeFlags
): Credentials {
  try {
    const credentials = readCredentialsFromKeyring(configPath, runtimeFlags);

    if (credentials !== null) {
      return credentials;
    }
  } catch {}

  return readCredentialsFromFile(configPath);
}

function writeFileStorageCredentials(
  configPath: string,
  credentials: Credentials,
  runtimeFlags: RuntimeFlags
): CredentialsStorageLocation {
  writeCredentialsToFile(configPath, credentials);
  tryDeleteCredentialsFromKeyring(configPath, runtimeFlags);
  return 'file';
}

function writeKeyringStorageCredentials(
  configPath: string,
  credentials: Credentials,
  runtimeFlags: RuntimeFlags
): CredentialsStorageLocation {
  writeCredentialsToKeyring(configPath, credentials, runtimeFlags);
  deleteCredentialsFile(configPath);
  return 'keyring';
}

function writeAutoStorageCredentials(
  configPath: string,
  credentials: Credentials,
  runtimeFlags: RuntimeFlags
): CredentialsStorageLocation {
  try {
    return writeKeyringStorageCredentials(
      configPath,
      credentials,
      runtimeFlags
    );
  } catch {
    deleteCredentialsFromKeyringIfAvailable(configPath, runtimeFlags);
    return writeFileStorageCredentials(configPath, credentials, runtimeFlags);
  }
}

function deleteFileStorageCredentials(
  configPath: string,
  runtimeFlags: RuntimeFlags
): void {
  deleteCredentialsFile(configPath);
  deleteCredentialsFromKeyringIfAvailable(configPath, runtimeFlags);
}

function deleteKeyringStorageCredentials(
  configPath: string,
  runtimeFlags: RuntimeFlags
): void {
  deleteCredentialsFromKeyring(configPath, runtimeFlags);
  deleteCredentialsFile(configPath);
}

function deleteAutoStorageCredentials(
  configPath: string,
  runtimeFlags: RuntimeFlags
): void {
  try {
    deleteCredentialsFromKeyring(configPath, runtimeFlags);
  } catch {}
  deleteCredentialsFile(configPath);
}

export function CredentialsStore(dir: string, config: GlobalConfig = {}) {
  const configPath = cliConfig.getAuthConfigFilePath(dir);
  const cliAuthConfig = resolveCliAuthConfig(dir, config);
  const tokenStorage = cliAuthConfig.credStorage;

  return {
    configPath,
    get(): Credentials {
      switch (tokenStorage) {
        case 'file':
          return readFileStorageCredentials(configPath, cliAuthConfig);
        case 'keyring':
          return readKeyringStorageCredentials(configPath, cliAuthConfig);
        case 'auto':
          return readAutoStorageCredentials(configPath, cliAuthConfig);
      }

      throw new Error(`Unsupported credStorage: ${tokenStorage}`);
    },
    update(config: Partial<Credentials>): CredentialsStorageLocation | void {
      if (config.skipWrite) return;
      const parsedConfig = parseCredentials(config);
      switch (tokenStorage) {
        case 'file':
          return writeFileStorageCredentials(
            configPath,
            parsedConfig,
            cliAuthConfig
          );
        case 'keyring':
          return writeKeyringStorageCredentials(
            configPath,
            parsedConfig,
            cliAuthConfig
          );
        case 'auto':
          return writeAutoStorageCredentials(
            configPath,
            parsedConfig,
            cliAuthConfig
          );
      }

      throw new Error(`Unsupported credStorage: ${tokenStorage}`);
    },
    delete(): void {
      switch (tokenStorage) {
        case 'file':
          deleteFileStorageCredentials(configPath, cliAuthConfig);
          break;
        case 'keyring':
          deleteKeyringStorageCredentials(configPath, cliAuthConfig);
          break;
        case 'auto':
          deleteAutoStorageCredentials(configPath, cliAuthConfig);
          break;
      }
    },
  };
}

export function readCredentials(dir: string, config: GlobalConfig = {}) {
  return CredentialsStore(dir, config).get();
}

export function readCliAuthConfig(dir: string, config: GlobalConfig = {}) {
  return readCredentials(dir, config);
}

export function writeCredentials(
  dir: string,
  credentials: Partial<Credentials>,
  config: GlobalConfig = {}
) {
  return CredentialsStore(dir, config).update(credentials);
}

function toPersistedAuthConfig(authConfig: PersistableAuthConfig): Credentials {
  const { skipWrite, tokenSource, ...persistedAuthConfig } = authConfig;
  return persistedAuthConfig;
}

export function persistCliAuthConfig(
  dir: string,
  authConfig: PersistableAuthConfig,
  config: GlobalConfig = {}
) {
  if (authConfig.skipWrite) {
    return;
  }

  const persistedAuthConfig = toPersistedAuthConfig(authConfig);

  if (!cliConfig.authConfigHasUsableTokenData(persistedAuthConfig)) {
    clearAllCredentialsStrict(dir);
    return;
  }

  return writeCredentials(dir, persistedAuthConfig, config);
}

export function clearCredentials(dir: string, config: GlobalConfig = {}) {
  CredentialsStore(dir, config).delete();
}

export function clearAllCredentials(dir: string) {
  for (const credStorage of cliConfig.CRED_STORAGE_VALUES) {
    try {
      clearCredentials(dir, { credStorage });
    } catch {}
  }
}

export function clearAllCredentialsStrict(dir: string) {
  const configPath = cliConfig.getAuthConfigFilePath(dir);
  const runtimeFlags = readRuntimeFlags();

  let fileError: unknown;
  let keyringError: unknown;

  try {
    deleteCredentialsFile(configPath);
  } catch (error) {
    fileError = error;
  }

  try {
    deleteCredentialsFromKeyring(configPath, runtimeFlags);
  } catch (error) {
    if (!isKeyringUnavailableError(error)) {
      keyringError = error;
    }
  }

  if (keyringError) {
    throw keyringError;
  }

  if (fileError) {
    throw fileError;
  }
}
