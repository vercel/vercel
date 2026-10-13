import {
  S3VectorsClient,
  type S3VectorsClientConfig,
} from '@aws-sdk/client-s3vectors';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { resourceEnv } from './internal/resolve';

/**
 * Options for {@link createS3Vectors}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * S3 vector bucket by its `<prefix>_S3_VECTOR_BUCKET_NAME` env var, then reads
 * every other field from env vars under that prefix.
 *
 * Any field on `S3VectorsClientConfig` may also be passed and is forwarded to
 * the underlying client.
 */
export interface CreateS3VectorsOptions extends Partial<S3VectorsClientConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
   * S3 vector buckets are connected.
   */
  prefix?: string;
  /** Overrides `<prefix>_S3_VECTOR_BUCKET_NAME`. */
  vectorBucketName?: string;
  /** Overrides `<prefix>_AWS_REGION`. */
  region?: string;
  /** Overrides `<prefix>_AWS_ROLE_ARN`. */
  roleArn?: string;
}

/**
 * An `S3VectorsClient` returned by {@link createS3Vectors}, with the
 * connected vector bucket's name attached so it can be passed as
 * `vectorBucketName` on each command.
 */
export type S3VectorBucketClient = S3VectorsClient & {
  /**
   * The vector bucket name, from `<prefix>_S3_VECTOR_BUCKET_NAME` or
   * `{ vectorBucketName }`.
   */
  readonly vectorBucketName: string;
};

/**
 * Creates an `S3VectorsClient` pre-configured for a Vercel Marketplace
 * S3 vector bucket.
 *
 * Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
 * The vector bucket name is exposed as `client.vectorBucketName`.
 *
 * @example
 * ```ts
 * import { createS3Vectors } from '@vercel/aws';
 * import { QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
 *
 * const vectors = createS3Vectors();
 * const { vectors: matches } = await vectors.send(
 *   new QueryVectorsCommand({
 *     vectorBucketName: vectors.vectorBucketName,
 *     indexName: 'docs',
 *     queryVector: { float32: embedding },
 *     topK: 5,
 *   })
 * );
 * ```
 */
export function createS3Vectors(
  opts: CreateS3VectorsOptions = {}
): S3VectorBucketClient {
  const env = resourceEnv(
    {
      factory: 'createS3Vectors',
      service: 'S3 Vectors',
      marker: 'S3_VECTOR_BUCKET_NAME',
    },
    opts.prefix
  );

  const vectorBucketName =
    opts.vectorBucketName ?? env.require('S3_VECTOR_BUCKET_NAME');
  const region = opts.region ?? env.require('AWS_REGION');
  const roleArn = opts.roleArn ?? env.require('AWS_ROLE_ARN');

  const {
    prefix: _p,
    vectorBucketName: _v,
    region: _r,
    roleArn: _ra,
    ...rest
  } = opts;

  const client = new S3VectorsClient({
    region,
    credentials: awsCredentialsProvider({ roleArn }),
    ...rest,
  });
  return Object.assign(client, { vectorBucketName });
}
