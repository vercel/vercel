import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
// NOTE: We are pinned on v5 because newer versions behave differently
// when there are dots in the application name, eg. `com.vercel.cli` becomes `com.vercel`
import XDGAppPaths from 'xdg-app-paths';
import { z } from 'zod/mini';

const AUTH_TOKEN_STORAGE = {
  AUTO: 'auto',
  FILE: 'file',
  KEYRING: 'keyring',
} as const;
const AUTH_TOKEN_STORAGE_VALUES = Object.values(AUTH_TOKEN_STORAGE);
const DEFAULT_AUTH_TOKEN_STORAGE = AUTH_TOKEN_STORAGE.FILE;
const KEYRING_SERVICE = 'Vercel Auth';
const KEYRING_UNAVAILABLE_ERROR =
  'OS keyring support is unavailable. Set `authTokenStorage` to `auto` or `file` to store credentials in auth.json instead.';

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

export type AuthTokenStorage =
  (typeof AUTH_TOKEN_STORAGE)[keyof typeof AUTH_TOKEN_STORAGE];
export type CredentialsStorageLocation = Exclude<
  AuthTokenStorage,
  (typeof AUTH_TOKEN_STORAGE)['AUTO']
>;

export interface GlobalConfig {
  authTokenStorage?: AuthTokenStorage;
}

const CredentialsSchema = z.object({
  /** An `access_token` obtained using the OAuth Device Authorization flow. */
  token: z.optional(z.string()),
  /** The ID of the currently authenticated user, cached from `/v2/user`. */
  userId: z.optional(z.string()),
  /** A `refresh_token` obtained using the OAuth Device Authorization flow. */
  refreshToken: z.optional(z.string()),
  /**
   * The absolute time (seconds) when the {@link Credentials.token} expires.
   * Used to optimistically check if the token is still valid.
   */
  expiresAt: z.optional(z.number()),
  /** Whether to skip writing the credentials to disk during {@link CredentialsStore.update} */
  skipWrite: z.optional(z.boolean()),
  '// Note': z.optional(z.string()),
  '// Docs': z.optional(z.string()),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

export function hasCredentials(credentials: Partial<Credentials>): boolean {
  return Boolean(
    credentials.token ||
      credentials.refreshToken ||
      typeof credentials.expiresAt === 'number'
  );
}

function parseCredentials(value: unknown): Credentials {
  return CredentialsSchema.parse(value) as Credentials;
}

function isAuthTokenStorage(value: unknown): value is AuthTokenStorage {
  return (
    typeof value === 'string' &&
    AUTH_TOKEN_STORAGE_VALUES.some(storage => storage === value)
  );
}

export function resolveAuthTokenStorage(value: unknown): AuthTokenStorage {
  if (typeof value === 'undefined') {
    return DEFAULT_AUTH_TOKEN_STORAGE;
  }

  if (isAuthTokenStorage(value)) {
    return value;
  }

  throw new Error(
    `Invalid value for \`authTokenStorage\`: ${JSON.stringify(
      value
    )}. Expected one of: ${AUTH_TOKEN_STORAGE_VALUES.map(storage => JSON.stringify(storage)).join(', ')}.`
  );
}

/** Returns whether a directory exists */
function isDirectory(path: string): boolean {
  try {
    return fs.lstatSync(path).isDirectory();
  } catch (_) {
    // We don't care which kind of error occured, it isn't a directory anyway.
    return false;
  }
}

/**
 * Returns in which directory the config should be present
 * @internal Should only be used in {@link CredentialsStore} or tests.
 */
export function getGlobalPathConfig(appName: string): string {
  const vercelDirectories = XDGAppPaths(appName).dataDirs();

  const possibleConfigPaths = [
    ...vercelDirectories, // latest vercel directory
    path.join(homedir(), '.now'), // legacy config in user's home directory
    ...XDGAppPaths('now').dataDirs(), // legacy XDG directory
  ];

  // The customPath flag is the preferred location,
  // followed by the vercel directory,
  // followed by the now directory.
  // If none of those exist, use the vercel directory.
  return (
    possibleConfigPaths.find(configPath => isDirectory(configPath)) ||
    vercelDirectories[0]
  );
}

export function getConfigFilePath(dir: string): string {
  return path.join(dir, 'config.json');
}

export function getAuthConfigFilePath(dir: string): string {
  return path.join(dir, 'auth.json');
}

export function readGlobalConfig(dir: string): GlobalConfig {
  const configPath = getConfigFilePath(dir);
  let config: {
    authTokenStorage?: unknown;
  };

  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      authTokenStorage?: unknown;
    };
  } catch (error) {
    if (isENOENTError(error)) {
      return {};
    }

    throw error;
  }

  return {
    authTokenStorage:
      typeof config.authTokenStorage === 'undefined'
        ? undefined
        : resolveAuthTokenStorage(config.authTokenStorage),
  };
}

export function getAuthTokenStorage(
  dir: string,
  config?: GlobalConfig
): AuthTokenStorage {
  if (config?.authTokenStorage) {
    return resolveAuthTokenStorage(config.authTokenStorage);
  }

  return resolveAuthTokenStorage(readGlobalConfig(dir).authTokenStorage);
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

function createKeyringEntry(configPath: string): KeyringEntry {
  try {
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
  return parseCredentials(JSON.parse(fs.readFileSync(configPath, 'utf8')));
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
  const directory = path.dirname(configPath);
  const temporaryPath = path.join(
    directory,
    `${path.basename(configPath)}.${process.pid}.${randomUUID()}.tmp`
  );

  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2) + '\n', {
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, configPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function readCredentialsFromKeyring(configPath: string): Credentials | null {
  const entry = createKeyringEntry(configPath);
  const value = entry.getPassword();

  if (value === null) {
    return null;
  }

  return parseCredentials(JSON.parse(value));
}

function writeCredentialsToKeyring(
  configPath: string,
  config: Credentials
): void {
  const entry = createKeyringEntry(configPath);
  entry.setPassword(JSON.stringify(config));
}

function deleteCredentialsFromKeyring(configPath: string): boolean {
  const entry = createKeyringEntry(configPath);
  return entry.deleteCredential();
}

function deleteCredentialsFile(configPath: string): void {
  fs.rmSync(configPath, { force: true });
}

function tryDeleteCredentialsFromKeyring(configPath: string): void {
  try {
    deleteCredentialsFromKeyring(configPath);
  } catch {}
}

function deleteCredentialsFromKeyringIfAvailable(configPath: string): void {
  try {
    deleteCredentialsFromKeyring(configPath);
  } catch (error) {
    if (!isKeyringUnavailableError(error)) {
      throw error;
    }
  }
}

function migrateCredentialsToFile(
  configPath: string,
  credentials: Credentials
): Credentials {
  writeCredentialsToFile(configPath, credentials);
  tryDeleteCredentialsFromKeyring(configPath);
  return credentials;
}

function tryReadKeyringCredentialsIntoFile(
  configPath: string
): Credentials | null {
  try {
    const credentials = readCredentialsFromKeyring(configPath);

    if (credentials === null) {
      return null;
    }

    return migrateCredentialsToFile(configPath, credentials);
  } catch {
    return null;
  }
}

function readFileStorageCredentials(configPath: string): Credentials {
  try {
    const credentials = readCredentialsFromFile(configPath);

    if (hasCredentials(credentials)) {
      return credentials;
    }

    // File mode treats keyring contents as stale-but-authoritative backup only
    // when auth.json has no usable credentials.
    return tryReadKeyringCredentialsIntoFile(configPath) ?? credentials;
  } catch (error) {
    if (!isENOENTError(error)) {
      throw error;
    }

    const credentials = tryReadKeyringCredentialsIntoFile(configPath);

    if (credentials !== null) {
      return credentials;
    }

    throw error;
  }
}

function migrateCredentialsToKeyring(
  configPath: string,
  credentials: Credentials
): Credentials {
  writeCredentialsToKeyring(configPath, credentials);
  deleteCredentialsFile(configPath);
  return credentials;
}

function readKeyringStorageCredentials(configPath: string): Credentials {
  const credentials = readCredentialsFromKeyring(configPath);

  if (credentials !== null) {
    return credentials;
  }

  try {
    const fileCredentials = readCredentialsFromFile(configPath);

    // Keyring mode eagerly migrates any remaining plaintext credentials out of
    // auth.json after the first successful read.
    return migrateCredentialsToKeyring(configPath, fileCredentials);
  } catch (error) {
    if (isENOENTError(error)) {
      throw createMissingCredentialsError(configPath);
    }

    throw error;
  }
}

function readAutoStorageCredentials(configPath: string): Credentials {
  try {
    const credentials = readCredentialsFromKeyring(configPath);

    if (credentials !== null) {
      return credentials;
    }
  } catch {}

  // Auto mode intentionally avoids read-time migration so that machines
  // without usable keyring support can keep working off auth.json.
  return readCredentialsFromFile(configPath);
}

function writeFileStorageCredentials(
  configPath: string,
  credentials: Credentials
): CredentialsStorageLocation {
  writeCredentialsToFile(configPath, credentials);
  tryDeleteCredentialsFromKeyring(configPath);
  return 'file';
}

function writeKeyringStorageCredentials(
  configPath: string,
  credentials: Credentials
): CredentialsStorageLocation {
  writeCredentialsToKeyring(configPath, credentials);
  deleteCredentialsFile(configPath);
  return 'keyring';
}

function writeAutoStorageCredentials(
  configPath: string,
  credentials: Credentials
): CredentialsStorageLocation {
  try {
    return writeKeyringStorageCredentials(configPath, credentials);
  } catch {
    tryDeleteCredentialsFromKeyring(configPath);
    return writeFileStorageCredentials(configPath, credentials);
  }
}

function deleteFileStorageCredentials(configPath: string): void {
  deleteCredentialsFile(configPath);
  deleteCredentialsFromKeyringIfAvailable(configPath);
}

function deleteKeyringStorageCredentials(configPath: string): void {
  deleteCredentialsFromKeyring(configPath);
  deleteCredentialsFile(configPath);
}

function deleteAutoStorageCredentials(configPath: string): void {
  try {
    deleteCredentialsFromKeyring(configPath);
  } catch {}
  deleteCredentialsFile(configPath);
}

export function CredentialsStore(dir: string, config: GlobalConfig = {}) {
  const configPath = getAuthConfigFilePath(dir);
  const tokenStorage = getAuthTokenStorage(dir, config);

  return {
    configPath,
    get(): Credentials {
      switch (tokenStorage) {
        case AUTH_TOKEN_STORAGE.FILE:
          return readFileStorageCredentials(configPath);
        case AUTH_TOKEN_STORAGE.KEYRING:
          return readKeyringStorageCredentials(configPath);
        case AUTH_TOKEN_STORAGE.AUTO:
          return readAutoStorageCredentials(configPath);
      }
    },
    /** Update the credentials store. If `skipWrite` is set, the update will be skipped. */
    update(config: Partial<Credentials>): CredentialsStorageLocation | void {
      if (config.skipWrite) return;
      const parsedConfig = parseCredentials(config);
      switch (tokenStorage) {
        case AUTH_TOKEN_STORAGE.FILE:
          return writeFileStorageCredentials(configPath, parsedConfig);
        case AUTH_TOKEN_STORAGE.KEYRING:
          return writeKeyringStorageCredentials(configPath, parsedConfig);
        case AUTH_TOKEN_STORAGE.AUTO:
          return writeAutoStorageCredentials(configPath, parsedConfig);
      }
    },
    delete(): void {
      switch (tokenStorage) {
        case AUTH_TOKEN_STORAGE.FILE:
          deleteFileStorageCredentials(configPath);
          break;
        case AUTH_TOKEN_STORAGE.KEYRING:
          deleteKeyringStorageCredentials(configPath);
          break;
        case AUTH_TOKEN_STORAGE.AUTO:
          deleteAutoStorageCredentials(configPath);
          break;
      }
    },
  };
}

export function readCredentials(dir: string, config: GlobalConfig = {}) {
  return CredentialsStore(dir, config).get();
}

export function writeCredentials(
  dir: string,
  credentials: Partial<Credentials>,
  config: GlobalConfig = {}
) {
  return CredentialsStore(dir, config).update(credentials);
}

export function clearCredentials(dir: string, config: GlobalConfig = {}) {
  CredentialsStore(dir, config).delete();
}

export function clearAllCredentials(dir: string) {
  for (const authTokenStorage of [
    AUTH_TOKEN_STORAGE.FILE,
    AUTH_TOKEN_STORAGE.KEYRING,
  ] as const) {
    try {
      clearCredentials(dir, { authTokenStorage });
    } catch {}
  }
}

export function clearAllCredentialsStrict(dir: string) {
  const configPath = getAuthConfigFilePath(dir);

  let fileError: unknown;
  let keyringError: unknown;

  try {
    deleteCredentialsFile(configPath);
  } catch (error) {
    fileError = error;
  }

  try {
    deleteCredentialsFromKeyring(configPath);
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
