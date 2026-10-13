import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('@opensearch-project/opensearch', () => {
  class Client {
    public config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  return { Client };
});
vi.mock('@opensearch-project/opensearch/aws', () => ({
  AwsSigv4Signer: (args: unknown) => ({ signer: args }),
}));
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
  DsqlSigner: function DsqlSigner() {},
}));
vi.mock('@aws-sdk/rds-signer', () => ({ Signer: function Signer() {} }));
vi.mock('@aws-sdk/client-dynamodb', () => {
  class DynamoDBClient {
    public config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  return { DynamoDBClient };
});
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: (client: unknown) => ({ client }) },
}));
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
  awsCredentialsProvider: ({ roleArn }: { roleArn: string }) => ({ roleArn }),
}));

import {
  createAuroraDSQL,
  createAuroraPostgreSQL,
  createDynamoDB,
  createOpenSearch,
  createS3,
  createS3Tables,
  createS3Vectors,
} from './index';

const originalEnv = process.env;
beforeEach(() => {
  process.env = {};
});
afterEach(() => {
  process.env = originalEnv;
});

/** Links a resource the way the Marketplace does: shared vars + its own. */
function link(prefix: string, name: string, own: Record<string, string>) {
  const p = prefix ? `${prefix}_` : '';
  process.env[`${p}AWS_ACCOUNT_ID`] = '123456789012';
  process.env[`${p}AWS_REGION`] = 'us-east-1';
  process.env[`${p}AWS_RESOURCE_ARN`] = `arn:aws:placeholder:::${name}`;
  process.env[`${p}AWS_ROLE_ARN`] = `arn:aws:iam::123456789012:role/${name}`;
  for (const [key, value] of Object.entries(own)) {
    process.env[`${p}${key}`] = value;
  }
}

const roleOf = (client: unknown) =>
  (client as { config: { credentials: { roleArn: string } } }).config
    .credentials.roleArn;

test('every product linked to one project resolves to its own resource', () => {
  link('', 'dsql', {
    PGHOST: 'abc.dsql.us-east-1.on.aws',
    PGUSER: 'admin',
    PGDATABASE: 'postgres',
    PGPORT: '5432',
    PGSSLMODE: 'require',
  });
  link('STORAGE', 'rds', {
    PGHOST: 'pg.cluster-abc.us-east-1.rds.amazonaws.com',
    PGUSER: 'postgres',
    PGDATABASE: 'postgres',
    PGPORT: '5432',
    PGSSLMODE: 'require',
  });
  link('STORAGE2', 'opensearch', {
    OPENSEARCH_ENDPOINT: 'https://os.us-east-1.aoss.amazonaws.com',
    OPENSEARCH_COLLECTION_NAME: 'docs',
    OPENSEARCH_COLLECTION_TYPE: 'SEARCH',
  });
  link('STORAGE3', 'dynamodb', {
    DYNAMODB_TABLE_NAME: 'users',
    DYNAMODB_TABLE_PARTITION_KEY: 'id',
  });
  link('STORAGE4', 's3', { S3_BUCKET_NAME: 'uploads' });
  link('STORAGE5', 's3vectors', { S3_VECTOR_BUCKET_NAME: 'embeddings' });
  link('STORAGE6', 's3tables', { S3_TABLE_BUCKET_NAME: 'analytics' });

  const dsql = createAuroraDSQL() as unknown as { config: { host: string } };
  const rds = createAuroraPostgreSQL() as unknown as {
    config: { host: string };
  };
  const os = createOpenSearch() as unknown as { config: { node: string } };
  const ddb = createDynamoDB();
  const s3 = createS3();
  const vectors = createS3Vectors();
  const tables = createS3Tables();

  expect(dsql.config.host).toBe('abc.dsql.us-east-1.on.aws');
  expect(rds.config.host).toBe('pg.cluster-abc.us-east-1.rds.amazonaws.com');
  expect(os.config.node).toBe('https://os.us-east-1.aoss.amazonaws.com');
  expect(ddb.tableName).toBe('users');
  expect(roleOf(ddb)).toMatch(/role\/dynamodb$/);
  expect(s3.bucket).toBe('uploads');
  expect(roleOf(s3)).toMatch(/role\/s3$/);
  expect(vectors.vectorBucketName).toBe('embeddings');
  expect(roleOf(vectors)).toMatch(/role\/s3vectors$/);
  expect(tables.tableBucketName).toBe('analytics');
  expect(roleOf(tables)).toMatch(/role\/s3tables$/);
});
