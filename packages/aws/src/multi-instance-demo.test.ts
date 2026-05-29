/**
 * Run:  pnpm --filter @vercel/aws vitest run src/multi-instance-demo.test.ts
 */
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

import { createAuroraDSQL } from './aurora-dsql';

const KEYS = [
  'AWS_RESOURCE_ARN',
  'AWS_REGION',
  'AWS_ROLE_ARN',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGDATABASE',
  'STORAGE2_AWS_RESOURCE_ARN',
  'STORAGE2_AWS_REGION',
  'STORAGE2_AWS_ROLE_ARN',
  'STORAGE2_PGHOST',
  'STORAGE2_PGPORT',
  'STORAGE2_PGUSER',
  'STORAGE2_PGDATABASE',
];

describe('multi-instance: "default db has no prefix" model', () => {
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

  function setDefaultDbUnprefixed() {
    process.env.AWS_RESOURCE_ARN = 'arn:aws:dsql:us-east-2:1:cluster/db1';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/db1';
    process.env.PGHOST = 'db1.dsql.us-east-2.on.aws';
    process.env.PGPORT = '5432';
    process.env.PGUSER = 'admin';
    process.env.PGDATABASE = 'postgres';
  }

  function setSecondDbStorage2() {
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dsql:eu-west-1:1:cluster/db2';
    process.env.STORAGE2_AWS_REGION = 'eu-west-1';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::2:role/db2';
    process.env.STORAGE2_PGHOST = 'db2.dsql.eu-west-1.on.aws';
    process.env.STORAGE2_PGPORT = '5432';
    process.env.STORAGE2_PGUSER = 'admin';
    process.env.STORAGE2_PGDATABASE = 'postgres';
  }

  test('single un-prefixed default db: bare call cannot find it', () => {
    setDefaultDbUnprefixed();
    expect(() => createAuroraDSQL()).toThrow(/no Aurora DSQL resource/);
  });

  test('example: default db + STORAGE2 silently misroutes db1', () => {
    setDefaultDbUnprefixed();
    setSecondDbStorage2();

    const db1 = createAuroraDSQL();
    const db2 = createAuroraDSQL({ prefix: 'STORAGE2' });

    const host1 = (db1 as unknown as { config: { host: string } }).config.host;
    const host2 = (db2 as unknown as { config: { host: string } }).config.host;

    expect(host1).toBe('db1.dsql.us-east-2.on.aws');
    expect(host2).toBe('db2.dsql.eu-west-1.on.aws');
  });
});
