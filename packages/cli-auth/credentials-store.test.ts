import { afterEach, beforeEach, vi, test, describe, expect } from 'vitest';
import {
  clearAllCredentialsStrict,
  getAuthConfigFilePath,
  getConfigFilePath,
  getAuthTokenStorage,
  getGlobalPathConfig,
  readCredentials,
  type Credentials,
  CredentialsStore,
  readGlobalConfig,
  setLoadKeyringModuleForTesting,
  writeCredentials,
} from './credentials-store';
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

const keyringState = vi.hoisted(() => ({
  values: new Map<string, string>(),
  failConstruct: false,
  failGet: false,
  failSet: false,
  failDelete: false,
}));

function createMockKeyringModule() {
  class Entry {
    private key: string;

    constructor(service: string, account: string) {
      if (keyringState.failConstruct) {
        throw new Error('keyring unavailable');
      }

      this.key = `${service}:${account}`;
    }

    getPassword() {
      if (keyringState.failGet) {
        throw new Error('keyring get failed');
      }

      return keyringState.values.get(this.key) ?? null;
    }

    setPassword(password: string) {
      if (keyringState.failSet) {
        throw new Error('keyring set failed');
      }

      keyringState.values.set(this.key, password);
    }

    deleteCredential() {
      if (keyringState.failDelete) {
        throw new Error('keyring delete failed');
      }

      return keyringState.values.delete(this.key);
    }
  }

  return { Entry };
}

beforeEach(() => {
  keyringState.values.clear();
  keyringState.failConstruct = false;
  keyringState.failGet = false;
  keyringState.failSet = false;
  keyringState.failDelete = false;
  setLoadKeyringModuleForTesting(() => createMockKeyringModule());
});

const configDirs: string[] = [];

afterEach(() => {
  setLoadKeyringModuleForTesting();
  for (const configDir of configDirs.splice(0)) {
    rmSync(configDir, { recursive: true, force: true });
  }
});

function createConfigDir() {
  const configDir = mkdtempSync(path.join(tmpdir(), 'cli-auth-'));
  configDirs.push(configDir);
  return configDir;
}

test('getGlobalPathConfig', () => {
  // NOTE: We are pinned on xdg-app-paths v5 because newer versions behave differently
  // when there are dots in the application name, eg. `com.vercel.cli` becomes `com.vercel`
  const appName = crypto.randomUUID().replaceAll('-', '.');
  const path = getGlobalPathConfig(appName);
  expect(path).toMatch(new RegExp(`.*${appName}$`));
});

test('getConfigFilePath uses the provided config directory', () => {
  const configDir = createConfigDir();
  expect(getConfigFilePath(configDir)).toBe(
    path.join(configDir, 'config.json')
  );
});

describe('CredentialsStore', () => {
  test('can read credentials store', () => {
    const configDir = createConfigDir();
    const configPath = path.join(configDir, 'auth.json');
    mkdirSync(path.dirname(configPath), { recursive: true });
    const config = { token: 'test-token' } satisfies Credentials;
    writeFileSync(configPath, JSON.stringify(config));

    const store = CredentialsStore(configDir, {
      authTokenStorage: 'file',
    });
    expect(store.get()).toEqual(config);
  });

  test('can write credentials store', () => {
    const store = CredentialsStore(createConfigDir(), {
      authTokenStorage: 'file',
    });
    const config = {
      token: 'test-access-token',
      refreshToken: 'test-refresh-token',
    } satisfies Credentials;

    store.update(config);
    expect(store.get()).toEqual(config);
  });

  test('can clear credentials store', () => {
    const store = CredentialsStore(createConfigDir(), {
      authTokenStorage: 'file',
    });
    store.update({ token: 'test-token' });
    store.delete();

    expect(() => store.get()).toThrow(/ENOENT/);
  });

  test('file storage delete removes stale keyring credentials', () => {
    const configDir = createConfigDir();
    CredentialsStore(configDir, {
      authTokenStorage: 'keyring',
    }).update({ token: 'keyring-token' });

    const store = CredentialsStore(configDir, {
      authTokenStorage: 'file',
    });

    store.delete();

    expect(keyringState.values.size).toBe(0);
    expect(() => store.get()).toThrow(/ENOENT/);
  });

  test('file storage delete surfaces keyring deletion failures', () => {
    const configDir = createConfigDir();
    CredentialsStore(configDir, {
      authTokenStorage: 'keyring',
    }).update({ token: 'keyring-token' });

    const store = CredentialsStore(configDir, {
      authTokenStorage: 'file',
    });

    keyringState.failDelete = true;

    expect(() => store.delete()).toThrow('keyring delete failed');
  });

  test('do not write when `skipWrite` is true', () => {
    const configDir = createConfigDir();
    const configPath = path.join(configDir, 'auth.json');
    mkdirSync(path.dirname(configPath), { recursive: true });
    const oldConfig = { token: 'test-token' } satisfies Credentials;
    writeFileSync(configPath, JSON.stringify(oldConfig));

    const store = CredentialsStore(configDir, {
      authTokenStorage: 'file',
    });
    store.update({
      token: 'new-token',
      refreshToken: 'new-refresh-token',
      skipWrite: true,
    });
    expect(store.get()).toEqual(oldConfig);
  });

  test('reads authTokenStorage from global config.json', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ authTokenStorage: 'keyring' }));

    expect(readGlobalConfig(configDir)).toEqual({
      authTokenStorage: 'keyring',
    });
    expect(getAuthTokenStorage(configDir)).toBe('keyring');
  });

  test('defaults authTokenStorage to file when unset', () => {
    const configDir = createConfigDir();

    expect(readGlobalConfig(configDir)).toEqual({});
    expect(getAuthTokenStorage(configDir)).toBe('file');
  });

  test('rejects invalid authTokenStorage from global config.json', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ authTokenStorage: 'keychain' }));

    expect(() => readGlobalConfig(configDir)).toThrow(
      'Invalid value for `authTokenStorage`: "keychain". Expected one of: "auto", "file", "keyring".'
    );
    expect(() => getAuthTokenStorage(configDir)).toThrow(
      'Invalid value for `authTokenStorage`: "keychain". Expected one of: "auto", "file", "keyring".'
    );
  });

  test('rejects malformed global config.json instead of defaulting to file storage', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, '{');

    expect(() => readGlobalConfig(configDir)).toThrow(SyntaxError);
    expect(() => getAuthTokenStorage(configDir)).toThrow(SyntaxError);
  });

  test('low-level reads and writes fail closed when global config.json is malformed', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    const authPath = getAuthConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, '{');

    expect(() => readCredentials(configDir)).toThrow(SyntaxError);
    expect(() => writeCredentials(configDir, { token: 'test-token' })).toThrow(
      SyntaxError
    );
    expect(existsSync(authPath)).toBe(false);
  });

  test('auto storage prefers keyring and removes fallback auth.json', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);
    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ token: 'stale-token' }));

    const store = CredentialsStore(configDir, {
      authTokenStorage: 'auto',
    });
    const config = { token: 'fresh-token', refreshToken: 'refresh-token' };

    store.update(config);

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(false);
  });

  test('auto storage falls back to auth.json when keyring writes fail', () => {
    const configDir = createConfigDir();
    CredentialsStore(configDir, {
      authTokenStorage: 'keyring',
    }).update({
      userId: 'user_stale',
      token: 'stale-keyring-token',
      refreshToken: 'stale-refresh-token',
    });

    const store = CredentialsStore(configDir, {
      authTokenStorage: 'auto',
    });
    const config = { token: 'fallback-token', refreshToken: 'refresh-token' };

    keyringState.failSet = true;

    store.update(config);

    expect(keyringState.values.size).toBe(0);
    expect(store.get()).toEqual(config);
  });

  test('file storage migrates existing keyring credentials into auth.json', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);
    const config = {
      '// Note': 'This is your Vercel credentials file. DO NOT SHARE!',
      userId: 'user_123',
      token: 'keyring-token',
      refreshToken: 'refresh-token',
    };

    CredentialsStore(configDir, {
      authTokenStorage: 'keyring',
    }).update(config);

    const store = CredentialsStore(configDir, {
      authTokenStorage: 'file',
    });

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(true);
    expect(keyringState.values.size).toBe(0);
  });

  test('file storage works when keyring is unavailable', () => {
    keyringState.failConstruct = true;

    const store = CredentialsStore(createConfigDir(), {
      authTokenStorage: 'file',
    });
    const config = { token: 'file-token', refreshToken: 'refresh-token' };

    store.update(config);

    expect(store.get()).toEqual(config);
  });

  test('auto storage falls back when keyring is unavailable', () => {
    keyringState.failConstruct = true;

    const store = CredentialsStore(createConfigDir(), {
      authTokenStorage: 'auto',
    });
    const config = { token: 'auto-file-token', refreshToken: 'refresh-token' };

    store.update(config);

    expect(store.get()).toEqual(config);
  });

  test('keyring storage surfaces friendly error when keyring is unavailable', () => {
    keyringState.failConstruct = true;

    const store = CredentialsStore(createConfigDir(), {
      authTokenStorage: 'keyring',
    });

    expect(() => store.get()).toThrow(
      'OS keyring support is unavailable. Set `authTokenStorage` to `auto` or `file` to store credentials in auth.json instead.'
    );
  });

  test('keyring storage reads from keyring without auth.json', () => {
    const configDir = createConfigDir();
    const store = CredentialsStore(configDir, {
      authTokenStorage: 'keyring',
    });
    const config = {
      '// Note': 'This is your Vercel credentials file. DO NOT SHARE!',
      userId: 'user_123',
      token: 'keyring-token',
      refreshToken: 'refresh-token',
    };

    store.update(config);

    expect(store.get()).toEqual(config);
  });

  test('keyring storage migrates existing auth.json credentials into keyring', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);
    const config = {
      '// Note': 'This is your Vercel credentials file. DO NOT SHARE!',
      userId: 'user_123',
      token: 'file-token',
      refreshToken: 'refresh-token',
    };

    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify(config));

    const store = CredentialsStore(configDir, {
      authTokenStorage: 'keyring',
    });

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(false);
    expect(keyringState.values.size).toBe(1);
  });

  test('keyring storage persists metadata without credentials', () => {
    const configDir = createConfigDir();
    const store = CredentialsStore(configDir, {
      authTokenStorage: 'keyring',
    });
    const config = {
      '// Note': 'This is your Vercel credentials file. DO NOT SHARE!',
      '// Docs':
        'https://vercel.com/docs/projects/project-configuration/global-configuration#auth.json',
      userId: 'user_123',
    } satisfies Credentials;

    store.update(config);

    expect(store.get()).toEqual(config);
  });

  test('strict clear ignores unavailable keyring support', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);

    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ token: 'file-token' }));

    keyringState.failConstruct = true;

    expect(() => clearAllCredentialsStrict(configDir)).not.toThrow();
    expect(existsSync(authPath)).toBe(false);
  });

  test('strict clear surfaces keyring deletion failures', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);

    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ token: 'file-token' }));

    CredentialsStore(configDir, {
      authTokenStorage: 'keyring',
    }).update({ token: 'keyring-token' });

    keyringState.failDelete = true;

    expect(() => clearAllCredentialsStrict(configDir)).toThrow(
      'keyring delete failed'
    );
    expect(existsSync(authPath)).toBe(false);
  });
});
