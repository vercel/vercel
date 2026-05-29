/**
 * DEMO TEST — multi-instance / "default db has no prefix" behavior.
 *
 * Context: the published MVP (`createOpenSearch`) read UN-prefixed env vars
 * (`OPENSEARCH_REGION`, `AWS_ROLE_ARN`, …). The multi-service PR replaced that
 * with resolution that finds a resource ONLY via `<PREFIX>_AWS_RESOURCE_ARN`,
 * with no fallback to the un-prefixed default. This file demonstrates what
 * happens to the "default db has no prefix" model under the new code.
 *
 * Run:  pnpm --filter @vercel/aws vitest run src/multi-instance-demo.test.ts
 *
 *   Scenario 1 (passes): a lone un-prefixed default db is invisible -> throws.
 *   Scenario 2 (FAILS):  default db + STORAGE2 -> the bare createAuroraDSQL()
 *                        silently connects to db2's cluster instead of db1.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Same mocks as aurora-dsql.test.ts so we exercise the real resolution logic.
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

// Every env var that could be in play across both models.
const KEYS = [
  // un-prefixed "default db" vars (the MVP / Jathin model)
  'AWS_RESOURCE_ARN',
  'AWS_REGION',
  'AWS_ROLE_ARN',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGDATABASE',
  // prefixed second db
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

  // The default/first integration injects its config WITHOUT a prefix.
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

  test('SCENARIO 1 — single un-prefixed default db: bare call cannot find it', () => {
    setDefaultDbUnprefixed();

    // Expectation under Jathin's model: db1 (the default) "just works".
    // Actual behavior: resolvePrefix only scans for `<PREFIX>_AWS_RESOURCE_ARN`,
    // so the un-prefixed default is invisible and the call throws.
    expect(() => createAuroraDSQL()).toThrow(/no Aurora DSQL resource/);
  });

  test('SCENARIO 2 — Michael’s example: default db + STORAGE2 silently misroutes db1', () => {
    setDefaultDbUnprefixed();
    setSecondDbStorage2();

    // const db1 = createAuroraDSQL();
    // const db2 = createAuroraDSQL({ prefix: 'STORAGE2' });
    const db1 = createAuroraDSQL();
    const db2 = createAuroraDSQL({ prefix: 'STORAGE2' });

    const host1 = (db1 as unknown as { config: { host: string } }).config.host;
    const host2 = (db2 as unknown as { config: { host: string } }).config.host;

    // What we WANT: db1 -> db1's host, db2 -> db2's host.
    // What actually happens: db1's bare call autodetects the only prefixed
    // ARN it can see (STORAGE2) and connects to db2's cluster. db1 is
    // unreachable, and there is no error to warn you.
    expect(host1).toBe('db1.dsql.us-east-2.on.aws'); // <-- this is the assertion that fails
    expect(host2).toBe('db2.dsql.eu-west-1.on.aws');
  });
});
