import { afterEach, beforeEach, vi, test, describe, expect } from 'vitest';
import {
  getAuthConfigFilePath,
  getConfigFilePath,
  getGlobalPathConfig,
} from '@vercel/cli-config';
import {
  clearAllCredentials,
  clearAllCredentialsStrict,
  getCredStorage,
  persistCliAuthConfig,
  readCredentials,
  resolveEffectiveCredStorage,
  type Credentials,
  CredentialsStore,
  readGlobalConfig,
  setLoadKeyringModuleForTesting,
  writeCredentials,
} from './credentials-store.ts';
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
  vi.unstubAllEnvs();
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
  expect(getGlobalPathConfig()).toEqual(expect.any(String));
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
      credStorage: 'file',
    });
    expect(store.get()).toEqual(config);
  });

  test('can write credentials store', () => {
    const store = CredentialsStore(createConfigDir(), {
      credStorage: 'file',
    });
    const config = {
      token: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600,
    };
    store.update(config);
    expect(store.get()).toEqual(config);
  });

  test('can clear credentials store', () => {
    const store = CredentialsStore(createConfigDir(), {
      credStorage: 'file',
    });
    store.update({ token: 'test-token' });
    store.delete();

    expect(() => store.get()).toThrow(/ENOENT/);
  });

  test('file storage delete removes stale keyring credentials', () => {
    const configDir = createConfigDir();
    CredentialsStore(configDir, {
      credStorage: 'keyring',
    }).update({ token: 'keyring-token' });

    const store = CredentialsStore(configDir, {
      credStorage: 'file',
    });

    store.delete();

    expect(keyringState.values.size).toBe(0);
    expect(() => store.get()).toThrow(/ENOENT/);
  });

  test('file storage delete surfaces keyring deletion failures', () => {
    const configDir = createConfigDir();
    CredentialsStore(configDir, {
      credStorage: 'keyring',
    }).update({ token: 'keyring-token' });

    const store = CredentialsStore(configDir, {
      credStorage: 'file',
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
      credStorage: 'file',
    });
    store.update({
      token: 'new-token',
      refreshToken: 'new-refresh-token',
      skipWrite: true,
    });
    expect(store.get()).toEqual(oldConfig);
  });

  test('reads credStorage from global config.json', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ credStorage: 'keyring' }));

    expect(readGlobalConfig(configDir)).toEqual({
      credStorage: 'keyring',
    });
    expect(getCredStorage(configDir)).toBe('keyring');
  });

  test('defaults credStorage to file when unset', () => {
    const configDir = createConfigDir();

    expect(readGlobalConfig(configDir)).toEqual({});
    expect(getCredStorage(configDir)).toBe('file');
  });

  test('VERCEL_TOKEN_STORAGE overrides global config.json', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ credStorage: 'file' }));
    vi.stubEnv('VERCEL_TOKEN_STORAGE', 'keyring');

    expect(getCredStorage(configDir)).toBe('keyring');
  });

  test('explicit credStorage overrides VERCEL_TOKEN_STORAGE', () => {
    vi.stubEnv('VERCEL_TOKEN_STORAGE', 'file');

    expect(
      getCredStorage(createConfigDir(), {
        credStorage: 'auto',
      })
    ).toBe('auto');
  });

  test('resolveEffectiveCredStorage returns explicit file storage', () => {
    expect(
      resolveEffectiveCredStorage(createConfigDir(), {
        credStorage: 'file',
      })
    ).toBe('file');
  });

  test('resolveEffectiveCredStorage returns explicit keyring storage', () => {
    keyringState.failConstruct = true;

    expect(
      resolveEffectiveCredStorage(createConfigDir(), {
        credStorage: 'keyring',
      })
    ).toBe('keyring');
  });

  test('resolveEffectiveCredStorage defaults to file when unset', () => {
    expect(resolveEffectiveCredStorage(createConfigDir())).toBe('file');
  });

  test('resolveEffectiveCredStorage resolves auto to keyring when available', () => {
    expect(
      resolveEffectiveCredStorage(createConfigDir(), {
        credStorage: 'auto',
      })
    ).toBe('keyring');
  });

  test('resolveEffectiveCredStorage resolves auto to file when keyring is unavailable', () => {
    keyringState.failConstruct = true;

    expect(
      resolveEffectiveCredStorage(createConfigDir(), {
        credStorage: 'auto',
      })
    ).toBe('file');
  });

  test('resolveEffectiveCredStorage prefers explicit credStorage over VERCEL_TOKEN_STORAGE', () => {
    vi.stubEnv('VERCEL_TOKEN_STORAGE', 'file');

    expect(
      resolveEffectiveCredStorage(createConfigDir(), {
        credStorage: 'keyring',
      })
    ).toBe('keyring');
  });

  test('rejects invalid credStorage from global config.json', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ credStorage: 'keychain' }));

    expect(() => readGlobalConfig(configDir)).toThrow(
      'Invalid value for `credStorage`: "keychain". Expected one of: "auto", "file", "keyring".'
    );
    expect(() => getCredStorage(configDir)).toThrow(
      'Invalid value for `credStorage`: "keychain". Expected one of: "auto", "file", "keyring".'
    );
  });

  test('rejects invalid VERCEL_TOKEN_STORAGE', () => {
    const configDir = createConfigDir();
    vi.stubEnv('VERCEL_TOKEN_STORAGE', 'keychain');

    expect(() => getCredStorage(configDir)).toThrow(
      'Invalid value for `VERCEL_TOKEN_STORAGE`: "keychain". Expected one of: "auto", "file", "keyring".'
    );
  });

  test('rejects malformed global config.json instead of defaulting storage', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, '{');

    expect(() => readGlobalConfig(configDir)).toThrow(SyntaxError);
    expect(() => getCredStorage(configDir)).toThrow(SyntaxError);
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

  test('VERCEL_TOKEN_STORAGE avoids parsing malformed global config.json', () => {
    const configDir = createConfigDir();
    const configPath = getConfigFilePath(configDir);
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, '{');
    vi.stubEnv('VERCEL_TOKEN_STORAGE', 'file');

    expect(() =>
      writeCredentials(configDir, { token: 'test-token' })
    ).not.toThrow();
    expect(readCredentials(configDir)).toEqual({ token: 'test-token' });
  });

  test('auto storage prefers keyring and removes fallback auth.json', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);
    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ token: 'stale-token' }));

    const store = CredentialsStore(configDir, {
      credStorage: 'auto',
    });
    const config = { token: 'fresh-token', refreshToken: 'refresh-token' };

    store.update(config);

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(false);
  });

  test('auto storage falls back to auth.json when keyring writes fail', () => {
    const configDir = createConfigDir();
    CredentialsStore(configDir, {
      credStorage: 'keyring',
    }).update({
      userId: 'user_stale',
      token: 'stale-keyring-token',
      refreshToken: 'stale-refresh-token',
    });

    const store = CredentialsStore(configDir, {
      credStorage: 'auto',
    });
    const config = { token: 'fallback-token', refreshToken: 'refresh-token' };

    keyringState.failSet = true;

    store.update(config);

    expect(keyringState.values.size).toBe(0);
    expect(store.get()).toEqual(config);
  });

  test('auto storage does not fall back when stale keyring cleanup fails', () => {
    const configDir = createConfigDir();
    CredentialsStore(configDir, {
      credStorage: 'keyring',
    }).update({
      token: 'stale-keyring-token',
      refreshToken: 'stale-refresh-token',
    });

    const store = CredentialsStore(configDir, {
      credStorage: 'auto',
    });

    keyringState.failSet = true;
    keyringState.failDelete = true;

    expect(() =>
      store.update({ token: 'fallback-token', refreshToken: 'refresh-token' })
    ).toThrow('keyring delete failed');
    expect(store.get()).toEqual({
      token: 'stale-keyring-token',
      refreshToken: 'stale-refresh-token',
    });
  });

  test('auto storage reads existing auth.json credentials without migrating on read', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);
    const config = {
      '// Note': 'This is your Vercel credentials file. DO NOT SHARE!',
      userId: 'user_123',
      token: 'file-token',
      refreshToken: 'refresh-token',
    } satisfies Credentials;

    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify(config));

    const store = CredentialsStore(configDir, {
      credStorage: 'auto',
    });

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(true);
    expect(keyringState.values.size).toBe(0);
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
      credStorage: 'keyring',
    }).update(config);

    const store = CredentialsStore(configDir, {
      credStorage: 'file',
    });

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(true);
    expect(keyringState.values.size).toBe(0);
  });

  test('file storage migrates keyring credentials when auth.json has only expiresAt', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);
    const config = {
      token: 'keyring-token',
      refreshToken: 'refresh-token',
    };

    CredentialsStore(configDir, {
      credStorage: 'keyring',
    }).update(config);

    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ expiresAt: 123 }));

    const store = CredentialsStore(configDir, {
      credStorage: 'file',
    });

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(true);
    expect(keyringState.values.size).toBe(0);
  });

  test('persisting expiresAt without token data clears credential stores', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);

    CredentialsStore(configDir, {
      credStorage: 'keyring',
    }).update({ token: 'keyring-token' });
    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ token: 'file-token' }));

    persistCliAuthConfig(configDir, { expiresAt: 123 });

    expect(existsSync(authPath)).toBe(false);
    expect(keyringState.values.size).toBe(0);
  });

  test('file storage works when keyring is unavailable', () => {
    keyringState.failConstruct = true;

    const store = CredentialsStore(createConfigDir(), {
      credStorage: 'file',
    });
    const config = { token: 'file-token', refreshToken: 'refresh-token' };

    store.update(config);

    expect(store.get()).toEqual(config);
  });

  test('auto storage falls back when keyring is unavailable', () => {
    keyringState.failConstruct = true;

    const store = CredentialsStore(createConfigDir(), {
      credStorage: 'auto',
    });
    const config = { token: 'auto-file-token', refreshToken: 'refresh-token' };

    store.update(config);

    expect(store.get()).toEqual(config);
  });

  test('auto storage falls back when keyring is disabled by env var', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);
    const config = { token: 'file-token', refreshToken: 'refresh-token' };

    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify(config));
    vi.stubEnv('VERCEL_TEST_KEYRING_UNAVAILABLE', '1');

    const store = CredentialsStore(configDir, {
      credStorage: 'auto',
    });

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(true);
    expect(keyringState.values.size).toBe(0);
  });

  test('keyring storage surfaces friendly error when keyring is unavailable', () => {
    keyringState.failConstruct = true;

    const store = CredentialsStore(createConfigDir(), {
      credStorage: 'keyring',
    });

    expect(() => store.get()).toThrow(
      'OS keyring support is unavailable. Set `credStorage` to `auto` or `file` to store credentials in auth.json instead.'
    );
  });

  test('keyring storage surfaces friendly error when disabled by env var', () => {
    vi.stubEnv('VERCEL_TEST_KEYRING_UNAVAILABLE', '1');

    const store = CredentialsStore(createConfigDir(), {
      credStorage: 'keyring',
    });

    expect(() => store.get()).toThrow(
      'OS keyring support is unavailable. Set `credStorage` to `auto` or `file` to store credentials in auth.json instead.'
    );
  });

  test('keyring storage reads from keyring without auth.json', () => {
    const configDir = createConfigDir();
    const store = CredentialsStore(configDir, {
      credStorage: 'keyring',
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
      credStorage: 'keyring',
    });

    expect(store.get()).toEqual(config);
    expect(existsSync(authPath)).toBe(false);
    expect(keyringState.values.size).toBe(1);
  });

  test('keyring storage persists metadata without credentials', () => {
    const configDir = createConfigDir();
    const store = CredentialsStore(configDir, {
      credStorage: 'keyring',
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

  test('clearAllCredentials ignores VERCEL_TOKEN_STORAGE for explicit clears', () => {
    const configDir = createConfigDir();

    CredentialsStore(configDir, {
      credStorage: 'keyring',
    }).update({ token: 'keyring-token' });

    vi.stubEnv('VERCEL_TOKEN_STORAGE', 'file');

    clearAllCredentials(configDir);

    expect(keyringState.values.size).toBe(0);
  });

  test('strict clear surfaces keyring deletion failures', () => {
    const configDir = createConfigDir();
    const authPath = getAuthConfigFilePath(configDir);

    mkdirSync(path.dirname(authPath), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ token: 'file-token' }));

    CredentialsStore(configDir, {
      credStorage: 'keyring',
    }).update({ token: 'keyring-token' });

    keyringState.failDelete = true;

    expect(() => clearAllCredentialsStrict(configDir)).toThrow(
      'keyring delete failed'
    );
    expect(existsSync(authPath)).toBe(false);
  });
});
