import { Pool, type PoolConfig } from 'pg';
import { Signer } from '@aws-sdk/rds-signer';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { requireEnv, resolvePrefix } from './internal/resolve-prefix';

/**
 * Options for {@link createAuroraPostgreSQL}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * Aurora PostgreSQL resource by scanning env for a `_AWS_RESOURCE_ARN`
 * starting with `arn:aws:rds:`, then reads every other field from env vars
 * under that prefix.
 *
 * Any field on `pg`'s `PoolConfig` may also be passed and is forwarded to
 * the `Pool`.
 */
export interface CreateAuroraPostgreSQLOptions extends Partial<PoolConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE`). Defaults to autodetect via the resource ARN.
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
  const factory = 'createAuroraPostgreSQL';
  let prefix = opts.prefix;
  const getPrefix = () =>
    (prefix ??= resolvePrefix({
      factory,
      service: 'Aurora PostgreSQL',
      arnPrefix: 'arn:aws:rds:',
    }));
  const fromEnv = (suffix: string) => requireEnv(factory, getPrefix(), suffix);

  const hostname = opts.hostname ?? fromEnv('PGHOST');
  const region = opts.region ?? fromEnv('AWS_REGION');
  const roleArn = opts.roleArn ?? fromEnv('AWS_ROLE_ARN');
  const user = opts.user ?? fromEnv('PGUSER');

  const portValue = prefix ? process.env[`${prefix}_PGPORT`] : undefined;
  const port = opts.port ?? (portValue ? Number(portValue) : 5432);
  const database =
    opts.database ??
    (prefix ? process.env[`${prefix}_PGDATABASE`] : undefined) ??
    'postgres';
  const sslmode = prefix ? process.env[`${prefix}_PGSSLMODE`] : undefined;

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
