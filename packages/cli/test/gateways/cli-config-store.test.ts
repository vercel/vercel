import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultAuthConfig } from '@vercel/cli-config';
import { liveCliConfigStore } from '../../src/gateways/cli-config-store';
import { FakeCliConfigStore } from '../fakes/fake-cli-config-store';

describe('FakeCliConfigStore', () => {
  it('reports missing config and credentials', () => {
    const store = new FakeCliConfigStore();

    expect(store.readGlobalConfig()).toEqual({ type: 'missing' });
    expect(store.readAuthConfig()).toEqual({ type: 'missing' });
  });

  it('reads back a written global config as a copy', () => {
    const store = new FakeCliConfigStore({ globalConfig: 'missing' });
    const config = { currentTeam: 'team_1' };

    expect(store.writeGlobalConfig({ config })).toEqual({ ok: true });
    config.currentTeam = 'team_changed';

    expect(store.readGlobalConfig()).toEqual({
      type: 'found',
      value: { currentTeam: 'team_1' },
    });
  });

  it('merges stored credentials with the default auth config', () => {
    const store = new FakeCliConfigStore({ authConfig: { token: 'tok_1' } });

    expect(store.readAuthConfig()).toEqual({
      type: 'found',
      value: { ...getDefaultAuthConfig(), token: 'tok_1' },
    });
  });

  it('persists credentials without writing explicit tokens', () => {
    const store = new FakeCliConfigStore();

    store.persistAuthConfig({
      authConfig: { token: 'tok_flag', skipWrite: true, tokenSource: 'flag' },
    });
    expect(store.authConfig).toBeUndefined();

    store.persistAuthConfig({ authConfig: { token: 'tok_1', userId: 'u1' } });
    expect(store.authConfig).toEqual({ token: 'tok_1', userId: 'u1' });
  });

  it('returns configured failures as error results', () => {
    const error = { code: 'EPERM', message: 'EPERM: operation not permitted' };
    const store = new FakeCliConfigStore({
      globalConfigReadError: error,
      globalConfigWriteError: error,
      authConfigReadError: error,
      authConfigPersistError: error,
      ensureGlobalDirError: error,
    });

    expect(store.ensureGlobalDir()).toEqual({ ok: false, error });
    expect(store.readGlobalConfig()).toEqual({ type: 'error', error });
    expect(store.writeGlobalConfig({ config: {} })).toEqual({
      ok: false,
      error,
    });
    expect(store.readAuthConfig()).toEqual({ type: 'error', error });
    expect(store.persistAuthConfig({ authConfig: { token: 't' } })).toEqual({
      ok: false,
      error,
    });
  });
});

describe('liveCliConfigStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vercel-cli-config-store-'));
    // Keep credentials in auth.json; never touch the OS keyring.
    vi.stubEnv('VERCEL_TOKEN_STORAGE', 'file');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the global directory', () => {
    const globalDir = join(dir, 'nested', 'global');
    const store = liveCliConfigStore({ globalDir });

    expect(store.globalDir).toBe(globalDir);
    expect(store.ensureGlobalDir()).toEqual({ ok: true });
    expect(store.readGlobalConfig()).toEqual({ type: 'missing' });
  });

  it('reads back a written global config', () => {
    const store = liveCliConfigStore({ globalDir: dir });

    expect(
      store.writeGlobalConfig({ config: { currentTeam: 'team_1' } })
    ).toEqual({ ok: true });
    expect(store.readGlobalConfig()).toMatchObject({
      type: 'found',
      value: { currentTeam: 'team_1' },
    });
  });

  it('reports an unreadable global config as an error', () => {
    writeFileSync(join(dir, 'config.json'), '{ not json');
    const store = liveCliConfigStore({ globalDir: dir });

    const result = store.readGlobalConfig();

    expect(result.type).toBe('error');
  });

  it('reads back persisted credentials', () => {
    const store = liveCliConfigStore({ globalDir: dir });

    expect(
      store.persistAuthConfig({ authConfig: { token: 'tok_1', userId: 'u1' } })
    ).toEqual({ ok: true });
    expect(store.readAuthConfig()).toMatchObject({
      type: 'found',
      value: { token: 'tok_1', userId: 'u1' },
    });
  });

  it('returns a write failure instead of exiting', () => {
    // A regular file where the directory should be makes every write fail.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, '');
    const store = liveCliConfigStore({ globalDir: join(blocker, 'global') });

    const result = store.writeGlobalConfig({ config: {} });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'write_failed' },
    });
    expect(result.ok || result.error.details?.cause).toBeInstanceOf(Error);
  });

  it('wraps credential persistence failures with the legacy message', () => {
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, '');
    const store = liveCliConfigStore({ globalDir: join(blocker, 'global') });

    const result = store.persistAuthConfig({ authConfig: { token: 'tok_1' } });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok || result.error.message).toMatch(/^Not able to create /);
  });
});
