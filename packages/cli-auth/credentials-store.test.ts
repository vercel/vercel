import { vi, test, describe, expect } from 'vitest';
import {
  type Credentials,
  CredentialsStore,
  getGlobalPathConfig,
} from './credentials-store';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return memfs.createFsFromVolume(memfs.Volume.fromJSON({}));
});

test('getGlobalPathConfig', () => {
  // NOTE: We are pinned on xdg-app-paths v5 because newer versions behave differently
  // when there are dots in the application name, eg. `com.vercel.cli` becomes `com.vercel`
  const dir = crypto.randomUUID().replaceAll('-', '.');
  const path = getGlobalPathConfig(dir);
  expect(path).toMatch(new RegExp(`.*${dir}$`));
});

describe('CredentialsStore', () => {
  test('can read credentials store', () => {
    const dir = crypto.randomUUID();
    const configPath = path.join(getGlobalPathConfig(dir), 'auth.json');
    mkdirSync(path.dirname(configPath), { recursive: true });
    const config = { token: 'test-token' } satisfies Credentials;
    writeFileSync(configPath, JSON.stringify(config));

    const store = CredentialsStore(dir);
    expect(store.get()).toEqual(config);
  });

  test('can write credentials store', () => {
    const store = CredentialsStore(crypto.randomUUID());
    const config = {
      token: 'test-access-token',
      refreshToken: 'test-refresh-token',
    } satisfies Credentials;

    store.update(config);
    expect(store.get()).toEqual(config);
  });

  test('can clear credentials store', () => {
    const store = CredentialsStore(crypto.randomUUID());
    store.update({});
    expect(store.get()).toEqual({});
  });

  test('do not write when `skipWrite` is true', () => {
    const dir = crypto.randomUUID();
    const configPath = path.join(getGlobalPathConfig(dir), 'auth.json');
    mkdirSync(path.dirname(configPath), { recursive: true });
    const oldConfig = { token: 'test-token' } satisfies Credentials;
    writeFileSync(configPath, JSON.stringify(oldConfig));

    const store = CredentialsStore(dir);
    store.update({
      token: 'new-token',
      refreshToken: 'new-refresh-token',
      skipWrite: true,
    });
    expect(store.get()).toEqual(oldConfig);
  });
});
