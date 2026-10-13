import { Pool, type PoolConfig } from 'pg';
import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { isProvisioningDsqlHost, pgHostKind } from './internal/postgres';
import { provisioningError, resourceEnv } from './internal/resolve';

/**
 * Options for {@link createAuroraDSQL}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * Aurora DSQL cluster by its `<prefix>_PGHOST` env var (a
 * `*.dsql.<region>.on.aws` hostname), then reads every other field from env
 * vars under that prefix. An explicit `prefix` pointing at an Aurora
 * PostgreSQL cluster throws.
 *
 * Any field on `pg`'s `PoolConfig` may also be passed and is forwarded to
 * the `Pool`.
 */
export interface CreateAuroraDSQLOptions extends Partial<PoolConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
   * Aurora DSQL clusters are connected.
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
 * Aurora DSQL cluster.
 *
 * Each new connection authenticates with a short-lived IAM auth token minted
 * via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
 *
 * @example
 * ```ts
 * import { createAuroraDSQL } from '@vercel/aws';
 *
 * const sql = createAuroraDSQL();
 * const { rows } = await sql.query('SELECT now()');
 * ```
 */
export function createAuroraDSQL(opts: CreateAuroraDSQLOptions = {}): Pool {
  const spec = {
    factory: 'createAuroraDSQL',
    service: 'Aurora DSQL',
    marker: 'PGHOST',
    accepts: (prefix: string) => pgHostKind(prefix) === 'dsql',
    rejects: (prefix: string) =>
      pgHostKind(prefix) === 'rds'
        ? 'is an Aurora PostgreSQL cluster — use createAuroraPostgreSQL() instead'
        : undefined,
  };
  const env = resourceEnv(spec, opts.prefix);

  const hostname = opts.hostname ?? env.require('PGHOST');
  if (opts.hostname === undefined && isProvisioningDsqlHost(hostname)) {
    throw provisioningError(spec, 'PGHOST', hostname);
  }
  const region = opts.region ?? env.require('AWS_REGION');
  const roleArn = opts.roleArn ?? env.require('AWS_ROLE_ARN');

  const portValue = env.optional('PGPORT');
  const port = opts.port ?? (portValue ? Number(portValue) : 5432);
  const user = opts.user ?? env.optional('PGUSER') ?? 'admin';
  const database = opts.database ?? env.optional('PGDATABASE') ?? 'postgres';

  const {
    prefix: _p,
    hostname: _h,
    region: _r,
    roleArn: _ra,
    port: _port,
    user: _user,
    database: _database,
    ...rest
  } = opts;

  const signer = new DsqlSigner({
    hostname,
    region,
    credentials: awsCredentialsProvider({ roleArn }),
  });

  return new Pool({
    host: hostname,
    port,
    user,
    database,
    ssl: true,
    password: async () =>
      user === 'admin'
        ? signer.getDbConnectAdminAuthToken()
        : signer.getDbConnectAuthToken(),
    ...rest,
  });
}
