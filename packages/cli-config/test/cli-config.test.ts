import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  parseAuthConfig,
  parseGlobalConfig,
  readConfigFile,
  writeConfigFile,
} from '../src';

const genericConfigSchema = z.object({
  enabled: z.boolean(),
  name: z.string().optional(),
});

describe('cli-config schema', () => {
  it('parses global config and preserves unknown properties', () => {
    const config = parseGlobalConfig({
      currentTeam: 'team_123',
      telemetry: {
        enabled: true,
        sampleRate: 1,
      },
      authTokenStorage: {
        nested: 'data',
      },
      customSetting: 'kept',
    });

    expect(config).toEqual({
      currentTeam: 'team_123',
      telemetry: {
        enabled: true,
        sampleRate: 1,
      },
      authTokenStorage: {
        nested: 'data',
      },
      customSetting: 'kept',
    });
  });

  it('rejects invalid global config shapes', () => {
    expect(() =>
      parseGlobalConfig({
        telemetry: {
          enabled: 'true',
        },
      })
    ).toThrow();
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
});
