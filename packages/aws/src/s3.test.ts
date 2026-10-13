import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    public config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  return { S3Client };
});

vi.mock('@aws-sdk/client-s3vectors', () => {
  class S3VectorsClient {
    public config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  return { S3VectorsClient };
});

vi.mock('@aws-sdk/client-s3tables', () => {
  class S3TablesClient {
    public config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  return { S3TablesClient };
});

vi.mock('@vercel/oidc-aws-credentials-provider', () => ({
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
  })),
}));

import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { createS3 } from './s3';
import { createS3Tables } from './s3-tables';
import { createS3Vectors } from './s3-vectors';

const configOf = (client: unknown) =>
  (client as { config: Record<string, unknown> }).config;

/** Mirrors the env the Marketplace injects for each S3 product. */
function link(
  prefix: string,
  marker: string,
  name: string,
  region = 'us-east-2'
) {
  const p = prefix ? `${prefix}_` : '';
  process.env[`${p}AWS_ACCOUNT_ID`] = '123456789012';
  process.env[`${p}AWS_REGION`] = region;
  process.env[`${p}AWS_RESOURCE_ARN`] = `arn:aws:placeholder:::${name}`;
  process.env[`${p}AWS_ROLE_ARN`] = `arn:aws:iam::123456789012:role/${name}`;
  process.env[`${p}${marker}`] = name;
}
const linkBucket = (prefix: string, name: string, region?: string) =>
  link(prefix, 'S3_BUCKET_NAME', name, region);
const linkVectorBucket = (prefix: string, name: string, region?: string) =>
  link(prefix, 'S3_VECTOR_BUCKET_NAME', name, region);
const linkTableBucket = (prefix: string, name: string, region?: string) =>
  link(prefix, 'S3_TABLE_BUCKET_NAME', name, region);

const originalEnv = process.env;
beforeEach(() => {
  process.env = {};
  vi.clearAllMocks();
});
afterEach(() => {
  process.env = originalEnv;
});

describe('createS3', () => {
  test('uses the unprefixed default connection', () => {
    linkBucket('', 'uploads');

    const s3 = createS3();
    expect(s3.bucket).toBe('uploads');
    expect(configOf(s3).region).toBe('us-east-2');
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::123456789012:role/uploads',
    });
  });

  test('default + STORAGE2: bare call returns default, prefixed returns prefixed', () => {
    linkBucket('', 'uploads');
    linkBucket('STORAGE2', 'backups', 'eu-west-1');

    expect(createS3().bucket).toBe('uploads');
    const second = createS3({ prefix: 'STORAGE2' });
    expect(second.bucket).toBe('backups');
    expect(configOf(second).region).toBe('eu-west-1');
  });

  test('throws when multiple prefixed buckets are connected', () => {
    linkBucket('STORAGE', 'a');
    linkBucket('STORAGE2', 'b');
    expect(() => createS3()).toThrow(/multiple S3 resources/);
  });

  test('throws when no bucket is connected', () => {
    expect(() => createS3()).toThrow(/no S3 resource/);
  });

  test('explicit options bypass env and are not forwarded to the client', () => {
    const s3 = createS3({
      bucket: 'explicit',
      region: 'ap-southeast-2',
      roleArn: 'arn:aws:iam::3:role/explicit',
      forcePathStyle: true,
    });

    expect(s3.bucket).toBe('explicit');
    expect(configOf(s3)).toMatchObject({
      region: 'ap-southeast-2',
      forcePathStyle: true,
    });
    expect(configOf(s3)).not.toHaveProperty('bucket');
    expect(configOf(s3)).not.toHaveProperty('roleArn');
  });
});

describe('createS3Vectors', () => {
  test('uses the unprefixed default connection', () => {
    linkVectorBucket('', 'embeddings');

    const vectors = createS3Vectors();
    expect(vectors.vectorBucketName).toBe('embeddings');
    expect(configOf(vectors).region).toBe('us-east-2');
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::123456789012:role/embeddings',
    });
  });

  test('passes prefix to pick between vector buckets', () => {
    linkVectorBucket('STORAGE', 'a');
    linkVectorBucket('STORAGE2', 'b');

    expect(() => createS3Vectors()).toThrow(/multiple S3 Vectors resources/);
    expect(createS3Vectors({ prefix: 'STORAGE2' }).vectorBucketName).toBe('b');
  });

  test('throws when no vector bucket is connected', () => {
    expect(() => createS3Vectors()).toThrow(/no S3 Vectors resource/);
  });
});

describe('createS3Tables', () => {
  test('uses the unprefixed default connection and builds the ARN', () => {
    linkTableBucket('', 'analytics');

    const tables = createS3Tables();
    expect(tables.tableBucketName).toBe('analytics');
    expect(tables.tableBucketARN).toBe(
      'arn:aws:s3tables:us-east-2:123456789012:bucket/analytics'
    );
    expect(configOf(tables).region).toBe('us-east-2');
  });

  test('passes prefix to pick between table buckets', () => {
    linkTableBucket('STORAGE', 'a');
    linkTableBucket('STORAGE2', 'b', 'eu-west-1');

    expect(() => createS3Tables()).toThrow(/multiple S3 Tables resources/);
    expect(createS3Tables({ prefix: 'STORAGE2' }).tableBucketARN).toBe(
      'arn:aws:s3tables:eu-west-1:123456789012:bucket/b'
    );
  });

  test('explicit ARN skips the account id lookup', () => {
    const tables = createS3Tables({
      tableBucketName: 'explicit',
      tableBucketARN: 'arn:aws-cn:s3tables:cn-north-1:1:bucket/explicit',
      region: 'cn-north-1',
      roleArn: 'arn:aws-cn:iam::1:role/explicit',
    });
    expect(tables.tableBucketARN).toBe(
      'arn:aws-cn:s3tables:cn-north-1:1:bucket/explicit'
    );
    expect(configOf(tables)).not.toHaveProperty('tableBucketARN');
  });

  test('throws when no table bucket is connected', () => {
    expect(() => createS3Tables()).toThrow(/no S3 Tables resource/);
  });
});

describe('all three S3 products linked to one project', () => {
  test('each factory finds only its own resource', () => {
    linkBucket('', 'uploads', 'us-east-1');
    linkVectorBucket('STORAGE2', 'embeddings', 'us-west-2');
    linkTableBucket('STORAGE3', 'analytics', 'eu-west-1');

    const s3 = createS3();
    const vectors = createS3Vectors();
    const tables = createS3Tables();

    expect(s3.bucket).toBe('uploads');
    expect(configOf(s3).region).toBe('us-east-1');
    expect(vectors.vectorBucketName).toBe('embeddings');
    expect(configOf(vectors).region).toBe('us-west-2');
    expect(tables.tableBucketName).toBe('analytics');
    expect(tables.tableBucketARN).toBe(
      'arn:aws:s3tables:eu-west-1:123456789012:bucket/analytics'
    );

    expect(
      (awsCredentialsProvider as unknown as ReturnType<typeof vi.fn>).mock.calls
    ).toEqual([
      [{ roleArn: 'arn:aws:iam::123456789012:role/uploads' }],
      [{ roleArn: 'arn:aws:iam::123456789012:role/embeddings' }],
      [{ roleArn: 'arn:aws:iam::123456789012:role/analytics' }],
    ]);
  });

  test('a non-S3 default does not hijack prefixed S3 products', () => {
    linkVectorBucket('', 'embeddings');
    linkBucket('STORAGE2', 'uploads');
    linkTableBucket('STORAGE3', 'analytics');

    expect(createS3().bucket).toBe('uploads');
    expect(createS3Vectors().vectorBucketName).toBe('embeddings');
    expect(createS3Tables().tableBucketName).toBe('analytics');
  });

  test('two of each product: defaults win, prefixes pick the rest', () => {
    linkBucket('', 'uploads');
    linkBucket('STORAGE2', 'backups');
    linkVectorBucket('STORAGE3', 'embeddings-a');
    linkVectorBucket('STORAGE4', 'embeddings-b');
    linkTableBucket('STORAGE5', 'analytics');

    expect(createS3().bucket).toBe('uploads');
    expect(createS3({ prefix: 'STORAGE2' }).bucket).toBe('backups');
    expect(() => createS3Vectors()).toThrow(
      /multiple S3 Vectors resources[\s\S]*STORAGE3[\s\S]*STORAGE4/
    );
    expect(createS3Vectors({ prefix: 'STORAGE4' }).vectorBucketName).toBe(
      'embeddings-b'
    );
    expect(createS3Tables().tableBucketName).toBe('analytics');
  });
});
