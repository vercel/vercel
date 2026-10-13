import { Pool, type PoolConfig } from 'pg';
import { Signer } from '@aws-sdk/rds-signer';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { pgHostKind } from './internal/postgres';
import { resourceEnv } from './internal/resolve';

/**
 * Options for {@link createAuroraPostgreSQL}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * Aurora PostgreSQL cluster by its `<prefix>_PGHOST` env var (a
 * `*.rds.amazonaws.com` hostname — Aurora DSQL clusters and non-AWS Postgres
 * integrations inject the same names), then reads every other field from env
 * vars under that prefix. An explicit `prefix` pointing at an Aurora DSQL
 * cluster throws.
 *
 * Any field on `pg`'s `PoolConfig` may also be passed and is forwarded to
 * the `Pool`.
 */
export interface CreateAuroraPostgreSQLOptions extends Partial<PoolConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
   * Aurora PostgreSQL clusters are connected.
   */
  prefix?: string;
  /** Overrides `<prefix>_PGHOST`. */
  hostname?: string;
  /** Overrides `<prefix>_AWS_REGION`. */
  region?: string;
  /** Overrides `<prefix>_AWS_ROLE_ARN`. */
  roleArn?: string;
}

/**
 * Creates a `pg` connection pool pre-configured for a Vercel Marketplace
 * Aurora PostgreSQL cluster.
 *
 * Each new connection authenticates with a short-lived IAM auth token minted
 * via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`. The cluster must have
 * IAM database authentication enabled.
 *
 * @example
 * ```ts
 * import { createAuroraPostgreSQL } from '@vercel/aws';
 *
 * const sql = createAuroraPostgreSQL();
 * const { rows } = await sql.query('SELECT * FROM users WHERE id = $1', [id]);
 * ```
 */
export function createAuroraPostgreSQL(
  opts: CreateAuroraPostgreSQLOptions = {}
): Pool {
  const env = resourceEnv(
    {
      factory: 'createAuroraPostgreSQL',
      service: 'Aurora PostgreSQL',
      marker: 'PGHOST',
      accepts: prefix => pgHostKind(prefix) === 'rds',
      rejects: prefix =>
        pgHostKind(prefix) === 'dsql'
          ? 'is an Aurora DSQL cluster — use createAuroraDSQL() instead'
          : undefined,
    },
    opts.prefix
  );

  const hostname = opts.hostname ?? env.require('PGHOST');
  const region = opts.region ?? env.require('AWS_REGION');
  const roleArn = opts.roleArn ?? env.require('AWS_ROLE_ARN');
  const user = opts.user ?? env.require('PGUSER');

  const portValue = env.optional('PGPORT');
  const port = opts.port ?? (portValue ? Number(portValue) : 5432);
  const database = opts.database ?? env.optional('PGDATABASE') ?? 'postgres';
  const sslmode = env.optional('PGSSLMODE');

  const {
    prefix: _p,
    hostname: _h,
    region: _r,
    roleArn: _ra,
    port: _port,
    user: _user,
    database: _database,
    ssl: _ssl,
    ...rest
  } = opts;

  const signer = new Signer({
    hostname,
    port,
    username: user,
    region,
    credentials: awsCredentialsProvider({ roleArn }),
  });

  return new Pool({
    host: hostname,
    port,
    user,
    database,
    ssl: opts.ssl ?? sslmode !== 'disable',
    password: () => signer.getAuthToken(),
    ...rest,
  });
}
