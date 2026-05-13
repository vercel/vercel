import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  authConfigHasUsableTokenData,
  deleteAuthConfig,
  getAuthConfigFilePath,
  getLikelyEffectiveCredStorage,
  parseAuthConfig,
  parseGlobalConfig,
  readAuthFileConfig,
  readConfigFile,
  tryReadAuthConfig,
  writeAuthConfig,
  writeConfigFile,
} from '../src';

const genericConfigSchema = z.object({
  enabled: z.boolean(),
  name: z.string().optional(),
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cli-config schema', () => {
  it('parses global config and preserves unknown properties', () => {
    const config = parseGlobalConfig({
      currentTeam: 'team_123',
      credStorage: 'auto',
      telemetry: {
        enabled: true,
        sampleRate: 1,
      },
      nested: {
        nested: 'data',
      },
      customSetting: 'kept',
    });

    expect(config).toEqual({
      currentTeam: 'team_123',
      credStorage: 'auto',
      telemetry: {
        enabled: true,
        sampleRate: 1,
      },
      nested: {
        nested: 'data',
      },
      customSetting: 'kept',
    });
  });

  it('rejects invalid global config shapes', () => {
    expect(() =>
      parseGlobalConfig({
        credStorage: 'keychain',
      })
    ).toThrow();
  });

  it('detects usable auth token data', () => {
    expect(authConfigHasUsableTokenData({ token: 'token_123' })).toBe(true);
    expect(authConfigHasUsableTokenData({ refreshToken: 'refresh_123' })).toBe(
      true
    );
    expect(authConfigHasUsableTokenData({ token: '' })).toBe(false);
    expect(authConfigHasUsableTokenData({ refreshToken: '' })).toBe(false);
    expect(authConfigHasUsableTokenData({ expiresAt: 123 })).toBe(false);
    expect(authConfigHasUsableTokenData(null)).toBe(false);
  });

  it('parses auth config and preserves unknown properties', () => {
    const config = parseAuthConfig({
      token: 'token_123',
      expiresAt: 123,
      metadata: {
        source: 'fixture',
      },
    });

    expect(config).toEqual({
      token: 'token_123',
      expiresAt: 123,
      metadata: {
        source: 'fixture',
      },
    });
  });

  it('rejects invalid auth config shapes', () => {
    expect(() =>
      parseAuthConfig({
        tokenSource: 'config-file',
      })
    ).toThrow();
  });

  it('reads generic schema-backed config files', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      const configPath = join(configDir, 'generic.json');
      await writeFile(
        configPath,
        JSON.stringify({ enabled: true, name: 'demo' }),
        'utf8'
      );

      expect(readConfigFile(configPath, genericConfigSchema)).toEqual({
        enabled: true,
        name: 'demo',
      });
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('writes generic schema-backed config files', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      const configPath = join(configDir, 'generic.json');
      writeConfigFile(configPath, genericConfigSchema, {
        enabled: true,
        name: 'demo',
      });

      const content = await readFile(configPath, 'utf8');
      expect(JSON.parse(content)).toEqual({ enabled: true, name: 'demo' });
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('reads, writes, and deletes auth config files by config directory', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      writeAuthConfig(configDir, { token: 'token_123' });

      expect(tryReadAuthConfig(configDir)).toEqual({ token: 'token_123' });

      deleteAuthConfig(configDir);

      expect(tryReadAuthConfig(configDir)).toBeNull();

      await writeFile(getAuthConfigFilePath(configDir), '{', 'utf8');

      expect(tryReadAuthConfig(configDir)).toBeNull();
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('reads auth file config without transient tokenSource data', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      const configPath = getAuthConfigFilePath(configDir);
      await writeFile(
        configPath,
        JSON.stringify({ token: 'token_123', tokenSource: 'env' }),
        'utf8'
      );

      expect(readAuthFileConfig(configPath)).toEqual({ token: 'token_123' });
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('treats keyring as the likely backend when explicitly configured', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({ credStorage: 'keyring' }),
        'utf8'
      );

      expect(getLikelyEffectiveCredStorage(configDir)).toBe('keyring');
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('uses VERCEL_TOKEN_STORAGE over config.json for the likely backend', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({ credStorage: 'file' }),
        'utf8'
      );
      vi.stubEnv('VERCEL_TOKEN_STORAGE', 'keyring');

      expect(getLikelyEffectiveCredStorage(configDir)).toBe('keyring');
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('uses VERCEL_TOKEN_STORAGE without parsing config.json for the likely backend', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      await writeFile(join(configDir, 'config.json'), '{', 'utf8');
      vi.stubEnv('VERCEL_TOKEN_STORAGE', 'keyring');

      expect(getLikelyEffectiveCredStorage(configDir)).toBe('keyring');
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('treats auto as file when auth.json contains usable token data', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({ credStorage: 'auto' }),
        'utf8'
      );
      await writeFile(
        join(configDir, 'auth.json'),
        JSON.stringify({ refreshToken: 'refresh_123' }),
        'utf8'
      );

      expect(getLikelyEffectiveCredStorage(configDir)).toBe('file');
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('treats auto as keyring when auth.json lacks usable token data', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({ credStorage: 'auto' }),
        'utf8'
      );
      await writeFile(
        join(configDir, 'auth.json'),
        JSON.stringify({ expiresAt: 123 }),
        'utf8'
      );

      expect(getLikelyEffectiveCredStorage(configDir)).toBe('keyring');
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('defaults the likely backend to file when credStorage is unset', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-config-'));

    try {
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({}),
        'utf8'
      );

      expect(getLikelyEffectiveCredStorage(configDir)).toBe('file');
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });
});
