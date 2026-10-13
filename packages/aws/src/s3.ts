import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { resourceEnv } from './internal/resolve';

/**
 * Options for {@link createS3}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * S3 bucket by its `<prefix>_S3_BUCKET_NAME` env var, then reads every other
 * field from env vars under that prefix.
 *
 * Any field on `S3ClientConfig` may also be passed and is forwarded to the
 * underlying client.
 */
export interface CreateS3Options extends Partial<S3ClientConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
   * S3 buckets are connected.
   */
  prefix?: string;
  /** Overrides `<prefix>_S3_BUCKET_NAME`. */
  bucket?: string;
  /** Overrides `<prefix>_AWS_REGION`. */
  region?: string;
  /** Overrides `<prefix>_AWS_ROLE_ARN`. */
  roleArn?: string;
}

/**
 * An `S3Client` returned by {@link createS3}, with the connected bucket's
 * name attached so it can be passed as `Bucket` on each command.
 */
export type S3BucketClient = S3Client & {
  /** The bucket name, from `<prefix>_S3_BUCKET_NAME` or `{ bucket }`. */
  readonly bucket: string;
};

/**
 * Creates an `S3Client` pre-configured for a Vercel Marketplace S3 bucket.
 *
 * Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
 * The bucket name is exposed as `client.bucket`.
 *
 * @example
 * ```ts
 * import { createS3 } from '@vercel/aws';
 * import { GetObjectCommand } from '@aws-sdk/client-s3';
 *
 * const s3 = createS3();
 * const object = await s3.send(
 *   new GetObjectCommand({ Bucket: s3.bucket, Key: 'hello.txt' })
 * );
 * ```
 */
export function createS3(opts: CreateS3Options = {}): S3BucketClient {
  const env = resourceEnv(
    { factory: 'createS3', service: 'S3', marker: 'S3_BUCKET_NAME' },
    opts.prefix
  );

  const bucket = opts.bucket ?? env.require('S3_BUCKET_NAME');
  const region = opts.region ?? env.require('AWS_REGION');
  const roleArn = opts.roleArn ?? env.require('AWS_ROLE_ARN');

  const { prefix: _p, bucket: _b, region: _r, roleArn: _ra, ...rest } = opts;

  const client = new S3Client({
    region,
    credentials: awsCredentialsProvider({ roleArn }),
    ...rest,
  });
  return Object.assign(client, { bucket });
}
