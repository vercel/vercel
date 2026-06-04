import { Pool, type PoolConfig } from 'pg';
import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { envKey, requireEnv, resolvePrefix } from './internal/resolve-prefix';

/**
 * Options for {@link createAuroraDSQL}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * Aurora DSQL resource by scanning env for a `_AWS_RESOURCE_ARN` starting
 * with `arn:aws:dsql:`, then reads every other field from env vars under
 * that prefix.
 *
 * Any field on `pg`'s `PoolConfig` may also be passed and is forwarded to
 * the `Pool`.
 */
export interface CreateAuroraDSQLOptions extends Partial<PoolConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE2`). Defaults to autodetect via the resource ARN.
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
  const factory = 'createAuroraDSQL';
  let prefix = opts.prefix;
  const getPrefix = () =>
    (prefix ??= resolvePrefix({
      factory,
      service: 'Aurora DSQL',
      arnPrefix: 'arn:aws:dsql:',
    }));
  const fromEnv = (suffix: string) => requireEnv(factory, getPrefix(), suffix);

  const hostname = opts.hostname ?? fromEnv('PGHOST');
  const region = opts.region ?? fromEnv('AWS_REGION');
  const roleArn = opts.roleArn ?? fromEnv('AWS_ROLE_ARN');

  const portValue =
    prefix !== undefined ? process.env[envKey(prefix, 'PGPORT')] : undefined;
  const port = opts.port ?? (portValue ? Number(portValue) : 5432);
  const user =
    opts.user ??
    (prefix !== undefined
      ? process.env[envKey(prefix, 'PGUSER')]
      : undefined) ??
    'admin';
  const database =
    opts.database ??
    (prefix !== undefined
      ? process.env[envKey(prefix, 'PGDATABASE')]
      : undefined) ??
    'postgres';

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
