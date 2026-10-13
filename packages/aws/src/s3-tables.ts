import {
  S3TablesClient,
  type S3TablesClientConfig,
} from '@aws-sdk/client-s3tables';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { resourceEnv } from './internal/resolve';

/**
 * Options for {@link createS3Tables}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * S3 table bucket by its `<prefix>_S3_TABLE_BUCKET_NAME` env var, then reads
 * every other field from env vars under that prefix.
 *
 * Any field on `S3TablesClientConfig` may also be passed and is forwarded to
 * the underlying client.
 */
export interface CreateS3TablesOptions extends Partial<S3TablesClientConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
   * S3 table buckets are connected.
   */
  prefix?: string;
  /** Overrides `<prefix>_S3_TABLE_BUCKET_NAME`. */
  tableBucketName?: string;
  /**
   * Overrides the table bucket ARN, which is otherwise built from the bucket
   * name, region, and `<prefix>_AWS_ACCOUNT_ID`.
   */
  tableBucketARN?: string;
  /** Overrides `<prefix>_AWS_ACCOUNT_ID`. */
  accountId?: string;
  /** Overrides `<prefix>_AWS_REGION`. */
  region?: string;
  /** Overrides `<prefix>_AWS_ROLE_ARN`. */
  roleArn?: string;
}

/**
 * An `S3TablesClient` returned by {@link createS3Tables}, with the connected
 * table bucket's name and ARN attached. Most S3 Tables commands address the
 * bucket by `tableBucketARN`.
 */
export type S3TableBucketClient = S3TablesClient & {
  /**
   * The table bucket name, from `<prefix>_S3_TABLE_BUCKET_NAME` or
   * `{ tableBucketName }`.
   */
  readonly tableBucketName: string;
  /** The table bucket ARN. */
  readonly tableBucketARN: string;
};

/**
 * Creates an `S3TablesClient` pre-configured for a Vercel Marketplace
 * S3 table bucket.
 *
 * Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
 * The table bucket is exposed as `client.tableBucketName` and
 * `client.tableBucketARN`.
 *
 * @example
 * ```ts
 * import { createS3Tables } from '@vercel/aws';
 * import { ListNamespacesCommand } from '@aws-sdk/client-s3tables';
 *
 * const tables = createS3Tables();
 * const { namespaces } = await tables.send(
 *   new ListNamespacesCommand({ tableBucketARN: tables.tableBucketARN })
 * );
 * ```
 */
export function createS3Tables(
  opts: CreateS3TablesOptions = {}
): S3TableBucketClient {
  const env = resourceEnv(
    {
      factory: 'createS3Tables',
      service: 'S3 Tables',
      marker: 'S3_TABLE_BUCKET_NAME',
    },
    opts.prefix
  );

  const tableBucketName =
    opts.tableBucketName ?? env.require('S3_TABLE_BUCKET_NAME');
  const region = opts.region ?? env.require('AWS_REGION');
  const roleArn = opts.roleArn ?? env.require('AWS_ROLE_ARN');
  // Built the same way the Marketplace builds it, rather than read from
  // `AWS_RESOURCE_ARN`, which stays "provisioning" on some adopted buckets.
  const tableBucketARN =
    opts.tableBucketARN ??
    `arn:aws:s3tables:${region}:${opts.accountId ?? env.require('AWS_ACCOUNT_ID')}:bucket/${tableBucketName}`;

  const {
    prefix: _p,
    tableBucketName: _n,
    tableBucketARN: _arn,
    accountId: _a,
    region: _r,
    roleArn: _ra,
    ...rest
  } = opts;

  const client = new S3TablesClient({
    region,
    credentials: awsCredentialsProvider({ roleArn }),
    ...rest,
  });
  return Object.assign(client, { tableBucketName, tableBucketARN });
}
