import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { envKey, resolvePrefix, requireEnv } from './resolve-prefix';

describe('resolvePrefix', () => {
  const original: Record<string, string | undefined> = {};
  const KEYS = [
    'AWS_RESOURCE_ARN',
    'STORAGE_AWS_RESOURCE_ARN',
    'STORAGE2_AWS_RESOURCE_ARN',
    'STORAGE3_AWS_RESOURCE_ARN',
    'PROD_DB_AWS_RESOURCE_ARN',
  ];

  beforeEach(() => {
    for (const k of KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  test('returns the single matching prefix', () => {
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dsql:us-east-2:1:cluster/abc';
    const prefix = resolvePrefix({
      factory: 'createAuroraDSQL',
      service: 'Aurora DSQL',
      arnPrefix: 'arn:aws:dsql:',
    });
    expect(prefix).toBe('STORAGE2');
  });

  test('ignores ARNs from other services', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:rds:us-east-2:1:cluster/aurora';
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dsql:us-east-2:1:cluster/dsql';
    const prefix = resolvePrefix({
      factory: 'createAuroraPostgreSQL',
      service: 'Aurora PostgreSQL',
      arnPrefix: 'arn:aws:rds:',
    });
    expect(prefix).toBe('STORAGE');
  });

  test('supports custom prefixes', () => {
    process.env.PROD_DB_AWS_RESOURCE_ARN =
      'arn:aws:dsql:us-east-2:1:cluster/abc';
    const prefix = resolvePrefix({
      factory: 'createAuroraDSQL',
      service: 'Aurora DSQL',
      arnPrefix: 'arn:aws:dsql:',
    });
    expect(prefix).toBe('PROD_DB');
  });

  test('throws when no matching resource is connected', () => {
    expect(() =>
      resolvePrefix({
        factory: 'createAuroraDSQL',
        service: 'Aurora DSQL',
        arnPrefix: 'arn:aws:dsql:',
      })
    ).toThrow(/no Aurora DSQL resource is connected/);
  });

  test('throws when multiple matching resources are connected', () => {
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dsql:us-east-2:1:cluster/abc';
    process.env.STORAGE3_AWS_RESOURCE_ARN =
      'arn:aws:dsql:us-east-2:1:cluster/def';
    expect(() =>
      resolvePrefix({
        factory: 'createAuroraDSQL',
        service: 'Aurora DSQL',
        arnPrefix: 'arn:aws:dsql:',
      })
    ).toThrow(/multiple Aurora DSQL resources[\s\S]*STORAGE2[\s\S]*STORAGE3/);
  });

  test('returns the empty prefix for an unprefixed default connection', () => {
    process.env.AWS_RESOURCE_ARN = 'arn:aws:dsql:us-east-2:1:cluster/abc';
    const prefix = resolvePrefix({
      factory: 'createAuroraDSQL',
      service: 'Aurora DSQL',
      arnPrefix: 'arn:aws:dsql:',
    });
    expect(prefix).toBe('');
  });

  test('prefers the unprefixed default when prefixed resources also exist', () => {
    process.env.AWS_RESOURCE_ARN = 'arn:aws:dsql:us-east-2:1:cluster/default';
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dsql:eu-west-1:1:cluster/second';
    const prefix = resolvePrefix({
      factory: 'createAuroraDSQL',
      service: 'Aurora DSQL',
      arnPrefix: 'arn:aws:dsql:',
    });
    expect(prefix).toBe('');
  });
});

describe('requireEnv', () => {
  const KEY = 'STORAGE_PGHOST';

  beforeEach(() => {
    delete process.env[KEY];
  });

  test('returns the value when set', () => {
    process.env[KEY] = 'example.host';
    expect(requireEnv('createAuroraDSQL', 'STORAGE', 'PGHOST')).toBe(
      'example.host'
    );
  });

  test('throws when unset', () => {
    expect(() => requireEnv('createAuroraDSQL', 'STORAGE', 'PGHOST')).toThrow(
      /missing required environment variable STORAGE_PGHOST/
    );
  });

  test('reads the bare suffix when prefix is empty', () => {
    process.env.PGHOST = 'default.host';
    try {
      expect(requireEnv('createAuroraDSQL', '', 'PGHOST')).toBe('default.host');
    } finally {
      delete process.env.PGHOST;
    }
  });
});

describe('envKey', () => {
  test('returns bare suffix when prefix is empty', () => {
    expect(envKey('', 'PGHOST')).toBe('PGHOST');
  });

  test('joins with underscore when prefix is non-empty', () => {
    expect(envKey('STORAGE2', 'PGHOST')).toBe('STORAGE2_PGHOST');
  });
});
