import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('pg', () => {
  class Pool {
    public config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  return { Pool };
});

vi.mock('@aws-sdk/rds-signer', () => ({
  Signer: vi.fn().mockImplementation((args: unknown) => ({
    __signer: args,
    getAuthToken: vi.fn(async () => 'rds-token'),
  })),
}));

vi.mock('@vercel/oidc-aws-credentials-provider', () => ({
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
  })),
}));

import { Signer } from '@aws-sdk/rds-signer';
import { createAuroraPostgreSQL } from './aurora-postgresql';

const KEYS = [
  'AWS_RESOURCE_ARN',
  'AWS_REGION',
  'AWS_ROLE_ARN',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGDATABASE',
  'PGSSLMODE',
  'STORAGE_AWS_RESOURCE_ARN',
  'STORAGE_AWS_REGION',
  'STORAGE_AWS_ROLE_ARN',
  'STORAGE_PGHOST',
  'STORAGE_PGPORT',
  'STORAGE_PGUSER',
  'STORAGE_PGDATABASE',
  'STORAGE_PGSSLMODE',
  'STORAGE2_AWS_RESOURCE_ARN',
  'STORAGE2_AWS_REGION',
  'STORAGE2_AWS_ROLE_ARN',
  'STORAGE2_PGHOST',
  'STORAGE2_PGPORT',
  'STORAGE2_PGUSER',
  'STORAGE2_PGDATABASE',
  'STORAGE2_PGSSLMODE',
];

describe('createAuroraPostgreSQL', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  function setStorage() {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:rds:us-east-2:1:cluster:aurora-prod';
    process.env.STORAGE_AWS_REGION = 'us-east-2';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/vercel-aurora';
    process.env.STORAGE_PGHOST =
      'aurora-prod.cluster-xyz.us-east-2.rds.amazonaws.com';
    process.env.STORAGE_PGPORT = '5432';
    process.env.STORAGE_PGUSER = 'app_user';
    process.env.STORAGE_PGDATABASE = 'app';
    process.env.STORAGE_PGSSLMODE = 'require';
  }

  test('autodetects the prefix and builds a Pool', async () => {
    setStorage();

    const pool = createAuroraPostgreSQL();
    const config = (pool as unknown as { config: Record<string, unknown> })
      .config;

    expect(config.host).toBe(
      'aurora-prod.cluster-xyz.us-east-2.rds.amazonaws.com'
    );
    expect(config.port).toBe(5432);
    expect(config.user).toBe('app_user');
    expect(config.database).toBe('app');
    expect(config.ssl).toBe(true);

    expect(Signer).toHaveBeenCalledTimes(1);
    const password = await (config.password as () => Promise<string>)();
    expect(password).toBe('rds-token');
  });

  test('passes prefix to override autodetect', () => {
    setStorage();
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:rds:eu-west-1:1:cluster:second';

    createAuroraPostgreSQL({ prefix: 'STORAGE' });

    const signerArgs = (Signer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { region: string };
    expect(signerArgs.region).toBe('us-east-2');
  });

  test('throws when no Aurora resource is connected', () => {
    expect(() => createAuroraPostgreSQL()).toThrow(
      /no Aurora PostgreSQL resource/
    );
  });

  test('throws when multiple Aurora resources are connected without a prefix', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:rds:us-east-2:1:cluster:one';
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:rds:us-east-2:1:cluster:two';
    expect(() => createAuroraPostgreSQL()).toThrow(
      /multiple Aurora PostgreSQL resources/
    );
  });

  function setDefault() {
    process.env.AWS_RESOURCE_ARN = 'arn:aws:rds:us-east-2:1:cluster:default';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/default';
    process.env.PGHOST = 'default.cluster.us-east-2.rds.amazonaws.com';
    process.env.PGPORT = '5432';
    process.env.PGUSER = 'app_user';
    process.env.PGDATABASE = 'app';
    process.env.PGSSLMODE = 'require';
  }

  test('autodetects an unprefixed default connection', () => {
    setDefault();

    const pool = createAuroraPostgreSQL();
    const config = (pool as unknown as { config: Record<string, unknown> })
      .config;
    expect(config.host).toBe('default.cluster.us-east-2.rds.amazonaws.com');
    expect(config.database).toBe('app');
  });

  test('default + STORAGE2: bare call returns default, prefixed returns prefixed', () => {
    setDefault();
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:rds:eu-west-1:1:cluster:second';
    process.env.STORAGE2_AWS_REGION = 'eu-west-1';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::2:role/second';
    process.env.STORAGE2_PGHOST = 'second.cluster.eu-west-1.rds.amazonaws.com';
    process.env.STORAGE2_PGUSER = 'app_user';
    process.env.STORAGE2_PGDATABASE = 'app';

    const db1 = createAuroraPostgreSQL();
    const db2 = createAuroraPostgreSQL({ prefix: 'STORAGE2' });

    expect((db1 as unknown as { config: { host: string } }).config.host).toBe(
      'default.cluster.us-east-2.rds.amazonaws.com'
    );
    expect((db2 as unknown as { config: { host: string } }).config.host).toBe(
      'second.cluster.eu-west-1.rds.amazonaws.com'
    );
  });
});
