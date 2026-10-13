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
  DsqlSigner: vi.fn().mockImplementation(function (args: unknown) {
    return {
      __signer: args,
      getDbConnectAdminAuthToken: vi.fn(async () => 'admin-token'),
      getDbConnectAuthToken: vi.fn(async () => 'user-token'),
    };
  }),
}));

vi.mock('@aws-sdk/rds-signer', () => ({
  Signer: vi.fn().mockImplementation(function (args: unknown) {
    return {
      __signer: args,
      getAuthToken: vi.fn(async () => 'rds-token'),
    };
  }),
}));

vi.mock('@vercel/oidc-aws-credentials-provider', () => ({
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
  })),
}));

import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { Signer } from '@aws-sdk/rds-signer';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { createAuroraDSQL } from './aurora-dsql';
import { createAuroraPostgreSQL } from './aurora-postgresql';

type PoolConfig = {
  host: string;
  port: number;
  user: string;
  database: string;
  ssl: unknown;
  password: () => Promise<string>;
  max?: number;
};
const configOf = (pool: unknown) => (pool as { config: PoolConfig }).config;

/** Mirrors the env the Marketplace injects for each cluster type. */
function linkDsql(prefix: string, host: string, region = 'us-east-2') {
  const p = prefix ? `${prefix}_` : '';
  process.env[`${p}AWS_REGION`] = region;
  process.env[`${p}AWS_ROLE_ARN`] = `arn:aws:iam::1:role/${host}`;
  process.env[`${p}PGHOST`] = `${host}.dsql.${region}.on.aws`;
  process.env[`${p}PGUSER`] = 'admin';
  process.env[`${p}PGDATABASE`] = 'postgres';
  process.env[`${p}PGPORT`] = '5432';
  process.env[`${p}PGSSLMODE`] = 'require';
}

function linkRds(prefix: string, cluster: string, region = 'us-east-2') {
  const p = prefix ? `${prefix}_` : '';
  process.env[`${p}AWS_REGION`] = region;
  process.env[`${p}AWS_ROLE_ARN`] = `arn:aws:iam::1:role/${cluster}`;
  process.env[`${p}PGHOST`] =
    `${cluster}.cluster-abc123.${region}.rds.amazonaws.com`;
  process.env[`${p}PGUSER`] = 'postgres';
  process.env[`${p}PGDATABASE`] = 'postgres';
  process.env[`${p}PGPORT`] = '5432';
  process.env[`${p}PGSSLMODE`] = 'require';
}

/** Mirrors Neon's unprefixed Postgres vars, which carry no AWS role. */
function linkNeon() {
  process.env.PGHOST = 'ep-cool-darkness-123456.us-east-2.aws.neon.tech';
  process.env.PGUSER = 'neondb_owner';
  process.env.PGDATABASE = 'neondb';
  process.env.PGPASSWORD = 'secret';
}

/** Any AWS resource holding the unprefixed shared names (here an S3 bucket). */
function linkUnprefixedBucket() {
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/uploads';
  process.env.S3_BUCKET_NAME = 'uploads';
}

const originalEnv = process.env;
beforeEach(() => {
  process.env = {};
  vi.clearAllMocks();
});
afterEach(() => {
  process.env = originalEnv;
});

describe('createAuroraDSQL', () => {
  test('uses the unprefixed default connection', async () => {
    linkDsql('', 'db1');

    const config = configOf(createAuroraDSQL());
    expect(config).toMatchObject({
      host: 'db1.dsql.us-east-2.on.aws',
      port: 5432,
      user: 'admin',
      database: 'postgres',
      ssl: true,
    });
    expect(await config.password()).toBe('admin-token');
    expect(DsqlSigner).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'db1.dsql.us-east-2.on.aws',
        region: 'us-east-2',
      })
    );
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::1:role/db1',
    });
  });

  test('default + STORAGE2: bare call returns default, prefixed returns prefixed', () => {
    linkDsql('', 'db1');
    linkDsql('STORAGE2', 'db2', 'eu-west-1');

    expect(configOf(createAuroraDSQL()).host).toBe('db1.dsql.us-east-2.on.aws');
    expect(configOf(createAuroraDSQL({ prefix: 'STORAGE2' })).host).toBe(
      'db2.dsql.eu-west-1.on.aws'
    );
  });

  test('uses the regular auth token for non-admin users', async () => {
    linkDsql('STORAGE', 'db1');

    const config = configOf(createAuroraDSQL({ user: 'reader' }));
    expect(config.user).toBe('reader');
    expect(await config.password()).toBe('user-token');
  });

  test('forwards extra PoolConfig fields', () => {
    linkDsql('STORAGE', 'db1');
    expect(configOf(createAuroraDSQL({ max: 3 })).max).toBe(3);
  });

  test('skips Aurora PostgreSQL clusters', () => {
    linkRds('', 'pg1');
    linkDsql('STORAGE2', 'db2');

    expect(configOf(createAuroraDSQL()).host).toBe('db2.dsql.us-east-2.on.aws');
  });

  test('throws when only Aurora PostgreSQL is connected', () => {
    linkRds('', 'pg1');
    expect(() => createAuroraDSQL()).toThrow(/no Aurora DSQL resource/);
  });

  test('explicit prefix pointing at Aurora PostgreSQL throws', () => {
    linkRds('STORAGE', 'pg1');
    expect(() => createAuroraDSQL({ prefix: 'STORAGE' })).toThrow(
      /under prefix "STORAGE" is an Aurora PostgreSQL cluster — use createAuroraPostgreSQL\(\)/
    );
  });

  test('throws while the cluster id is unknown', () => {
    linkDsql('', 'db1');
    process.env.PGHOST = 'provisioning.dsql.us-east-2.on.aws';
    expect(() => createAuroraDSQL()).toThrow(
      /PGHOST is "provisioning.dsql.us-east-2.on.aws" — the Aurora DSQL resource has not finished provisioning/
    );
  });

  test('ignores a non-AWS Postgres host next to unprefixed AWS vars', () => {
    linkNeon();
    linkUnprefixedBucket();
    expect(() => createAuroraDSQL()).toThrow(/no Aurora DSQL resource/);
  });

  test('throws when multiple prefixed clusters are connected', () => {
    linkDsql('STORAGE', 'db1');
    linkDsql('STORAGE2', 'db2');
    expect(() => createAuroraDSQL()).toThrow(/multiple Aurora DSQL resources/);
  });
});

describe('createAuroraPostgreSQL', () => {
  test('uses the unprefixed default connection', async () => {
    linkRds('', 'pg1');

    const config = configOf(createAuroraPostgreSQL());
    expect(config).toMatchObject({
      host: 'pg1.cluster-abc123.us-east-2.rds.amazonaws.com',
      port: 5432,
      user: 'postgres',
      database: 'postgres',
      ssl: true,
    });
    expect(await config.password()).toBe('rds-token');
    expect(Signer).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'pg1.cluster-abc123.us-east-2.rds.amazonaws.com',
        port: 5432,
        username: 'postgres',
        region: 'us-east-2',
      })
    );
  });

  test('disables ssl when PGSSLMODE=disable', () => {
    linkRds('STORAGE', 'pg1');
    process.env.STORAGE_PGSSLMODE = 'disable';
    expect(configOf(createAuroraPostgreSQL()).ssl).toBe(false);
  });

  test('skips Aurora DSQL clusters', () => {
    linkDsql('', 'db1');
    linkRds('STORAGE2', 'pg2');

    expect(configOf(createAuroraPostgreSQL()).host).toBe(
      'pg2.cluster-abc123.us-east-2.rds.amazonaws.com'
    );
  });

  test('throws when only Aurora DSQL is connected', () => {
    linkDsql('', 'db1');
    expect(() => createAuroraPostgreSQL()).toThrow(
      /no Aurora PostgreSQL resource/
    );
  });

  test('explicit prefix pointing at Aurora DSQL throws', () => {
    linkDsql('', 'db1');
    expect(() => createAuroraPostgreSQL({ prefix: '' })).toThrow(
      /linked without a prefix is an Aurora DSQL cluster — use createAuroraDSQL\(\)/
    );
  });

  test('explicit prefix with an unrecognized host is trusted', () => {
    linkRds('STORAGE', 'pg1');
    process.env.STORAGE_PGHOST = 'db.internal.example.com';
    expect(configOf(createAuroraPostgreSQL({ prefix: 'STORAGE' })).host).toBe(
      'db.internal.example.com'
    );
  });

  test('accepts China-region hostnames', () => {
    linkRds('', 'pg1', 'cn-north-1');
    process.env.PGHOST = 'pg1.cluster-abc123.cn-north-1.rds.amazonaws.com.cn';
    expect(configOf(createAuroraPostgreSQL()).host).toBe(
      'pg1.cluster-abc123.cn-north-1.rds.amazonaws.com.cn'
    );
  });

  test('ignores a non-AWS Postgres host next to unprefixed AWS vars', () => {
    linkNeon();
    linkUnprefixedBucket();
    expect(() => createAuroraPostgreSQL()).toThrow(
      /no Aurora PostgreSQL resource/
    );
  });

  test('a non-AWS Postgres default does not shadow a prefixed cluster', () => {
    linkNeon();
    linkUnprefixedBucket();
    linkRds('STORAGE2', 'pg2');

    expect(configOf(createAuroraPostgreSQL()).host).toBe(
      'pg2.cluster-abc123.us-east-2.rds.amazonaws.com'
    );
  });

  test('throws while the cluster is provisioning', () => {
    linkRds('', 'pg1');
    process.env.PGHOST = 'provisioning';
    expect(() => createAuroraPostgreSQL()).toThrow(/PGHOST is "provisioning"/);
  });

  test('explicit options bypass env entirely', () => {
    const config = configOf(
      createAuroraPostgreSQL({
        hostname: 'custom.example',
        region: 'eu-west-1',
        roleArn: 'arn:aws:iam::2:role/custom',
        user: 'app',
      })
    );
    expect(config).toMatchObject({
      host: 'custom.example',
      user: 'app',
      port: 5432,
      database: 'postgres',
    });
  });
});
