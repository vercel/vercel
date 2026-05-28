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

vi.mock('@aws-sdk/dsql-signer', () => ({
  DsqlSigner: vi.fn().mockImplementation((args: unknown) => ({
    __signer: args,
    getDbConnectAdminAuthToken: vi.fn(async () => 'admin-token'),
    getDbConnectAuthToken: vi.fn(async () => 'user-token'),
  })),
}));

vi.mock('@vercel/oidc-aws-credentials-provider', () => ({
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
  })),
}));

import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { createAuroraDSQL } from './aurora-dsql';

const KEYS = [
  'STORAGE_AWS_RESOURCE_ARN',
  'STORAGE_AWS_REGION',
  'STORAGE_AWS_ROLE_ARN',
  'STORAGE_PGHOST',
  'STORAGE_PGPORT',
  'STORAGE_PGUSER',
  'STORAGE_PGDATABASE',
  'STORAGE2_AWS_RESOURCE_ARN',
];

describe('createAuroraDSQL', () => {
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
      'arn:aws:dsql:us-east-2:1:cluster/abc';
    process.env.STORAGE_AWS_REGION = 'us-east-2';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/vercel-dsql';
    process.env.STORAGE_PGHOST = 'abc.dsql.us-east-2.on.aws';
    process.env.STORAGE_PGPORT = '5432';
    process.env.STORAGE_PGUSER = 'admin';
    process.env.STORAGE_PGDATABASE = 'postgres';
  }

  test('autodetects the prefix and builds a Pool', async () => {
    setStorage();

    const pool = createAuroraDSQL();
    const config = (pool as unknown as { config: Record<string, unknown> })
      .config;

    expect(config.host).toBe('abc.dsql.us-east-2.on.aws');
    expect(config.port).toBe(5432);
    expect(config.user).toBe('admin');
    expect(config.database).toBe('postgres');
    expect(config.ssl).toBe(true);

    const password = await (config.password as () => Promise<string>)();
    expect(password).toBe('admin-token');
  });

  test('uses regular auth token for non-admin users', async () => {
    setStorage();

    const pool = createAuroraDSQL({ user: 'reader' });
    const config = (pool as unknown as { config: Record<string, unknown> })
      .config;
    const password = await (config.password as () => Promise<string>)();
    expect(password).toBe('user-token');
  });

  test('passes prefix to override autodetect', () => {
    setStorage();
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dsql:eu-west-1:1:cluster/def';

    createAuroraDSQL({ prefix: 'STORAGE' });

    const signerArgs = (DsqlSigner as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { hostname: string; region: string };
    expect(signerArgs.region).toBe('us-east-2');
  });

  test('throws when no DSQL resource is connected', () => {
    expect(() => createAuroraDSQL()).toThrow(/no Aurora DSQL resource/);
  });

  test('throws when multiple DSQL resources are connected without a prefix', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:dsql:us-east-2:1:cluster/abc';
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dsql:us-east-2:1:cluster/def';
    expect(() => createAuroraDSQL()).toThrow(/multiple Aurora DSQL resources/);
  });
});
