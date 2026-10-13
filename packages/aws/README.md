# @vercel/aws

Pre-configured AWS service clients for [Vercel Marketplace](https://vercel.com/marketplace) resources.

Credentials are resolved automatically via [Vercel OIDC](https://vercel.com/docs/security/secure-backend-access/oidc) — no static access keys required. Configuration is read from the env vars Vercel injects when you connect a resource to a project; in the common case where one resource of a given service is connected, you call the factory with no arguments.

## Install

```sh
pnpm add @vercel/aws
```

Then install the AWS SDK(s) for the services you use:

```sh
pnpm add @opensearch-project/opensearch                  # OpenSearch
pnpm add @aws-sdk/dsql-signer pg                         # Aurora DSQL
pnpm add @aws-sdk/rds-signer pg                          # Aurora PostgreSQL
pnpm add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb  # DynamoDB
pnpm add @aws-sdk/client-s3                              # S3
pnpm add @aws-sdk/client-s3vectors                       # S3 Vectors
pnpm add @aws-sdk/client-s3tables                        # S3 Tables
```

## How resolution works

The first resource you connect to a project gets bare env var names (`AWS_ROLE_ARN`, `S3_BUCKET_NAME`, …). Each additional resource is namespaced under the prefix you choose when connecting it — for example `STORAGE2_AWS_ROLE_ARN`, `STORAGE2_S3_BUCKET_NAME`.

Every service injects an env var no other service does, and each factory looks for its own alongside a matching `AWS_ROLE_ARN`:

| Factory                                         | Looks for                                  |
| ----------------------------------------------- | ------------------------------------------ |
| `createOpenSearch()`                            | `OPENSEARCH_ENDPOINT`                      |
| `createAuroraDSQL()`                            | `PGHOST` ending in `.dsql.<region>.on.aws` |
| `createAuroraPostgreSQL()`                      | `PGHOST` ending in `.rds.amazonaws.com`    |
| `createDynamoDB()` / `createDynamoDBDocument()` | `DYNAMODB_TABLE_NAME`                      |
| `createS3()`                                    | `S3_BUCKET_NAME`                           |
| `createS3Vectors()`                             | `S3_VECTOR_BUCKET_NAME`                    |
| `createS3Tables()`                              | `S3_TABLE_BUCKET_NAME`                     |

Matching Postgres by hostname also means a non-AWS Postgres integration that injects the same `PG*` names (e.g. Neon) is never mistaken for an Aurora cluster. So resources of different services never get mixed up — an S3 bucket, an S3 vector bucket, and an S3 table bucket connected to the same project are each found by their own factory, whichever one holds the unprefixed names.

When more than one resource of the same service is connected, the unprefixed one wins. If they are all prefixed, the factory throws with the prefixes it found; pass `{ prefix }` to pick one. You can also pass explicit fields (`region`, `roleArn`, `bucket`, …) to bypass env lookup entirely — useful for local development.

### Env vars your app defines itself

If your app sets its own variable with one of the names above (for example its own `S3_BUCKET_NAME`) and an AWS resource of a different service also uses the unprefixed names, the matching factory will pair your variable with that resource's `AWS_ROLE_ARN`. Requests then fail with `AccessDenied`, since each Marketplace role only grants access to its own resource. Rename your variable, or connect the AWS resource under a prefix.

## OpenSearch

```ts
import { createOpenSearch } from '@vercel/aws';

const os = createOpenSearch();

const results = await os.search({
  index: 'docs',
  body: { query: { match: { title: 'vercel' } } },
});
```

## Aurora DSQL

Returns a [`pg`](https://node-postgres.com) connection pool. Each new connection authenticates with a short-lived IAM auth token minted via OIDC.

```ts
import { createAuroraDSQL } from '@vercel/aws';

const sql = createAuroraDSQL();

const { rows } = await sql.query('SELECT * FROM users WHERE id = $1', [id]);
```

The pool defaults to user `admin` and database `postgres`. Override either, or any other `pg` `PoolConfig` field, by passing it through:

```ts
const sql = createAuroraDSQL({ user: 'reader', max: 5 });
```

## Aurora PostgreSQL

Same shape as Aurora DSQL — returns a `pg.Pool` that authenticates each new connection with an IAM auth token. The cluster must have IAM database authentication enabled.

```ts
import { createAuroraPostgreSQL } from '@vercel/aws';

const sql = createAuroraPostgreSQL();

const { rows } = await sql.query('SELECT now()');
```

## DynamoDB

`createDynamoDB()` returns the low-level `DynamoDBClient`, with the connected table's name attached as `tableName`:

```ts
import { createDynamoDB } from '@vercel/aws';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = createDynamoDB();
const result = await ddb.send(
  new GetItemCommand({ TableName: ddb.tableName, Key: { id: { S: '1' } } })
);
```

`createDynamoDBDocument()` returns a `DynamoDBDocumentClient` that auto-marshals plain JS objects to/from DynamoDB attribute values — usually what you want in application code:

```ts
import { createDynamoDBDocument } from '@vercel/aws';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = createDynamoDBDocument();
const result = await ddb.send(
  new GetCommand({ TableName: ddb.tableName, Key: { id: '1' } })
);
```

## S3

`createS3()` returns an `S3Client` with the connected bucket's name attached as `bucket`:

```ts
import { createS3 } from '@vercel/aws';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = createS3();

await s3.send(
  new PutObjectCommand({ Bucket: s3.bucket, Key: 'hello.txt', Body: 'hi' })
);
const object = await s3.send(
  new GetObjectCommand({ Bucket: s3.bucket, Key: 'hello.txt' })
);
```

## S3 Vectors

`createS3Vectors()` returns an `S3VectorsClient` with the connected vector bucket's name attached as `vectorBucketName`:

```ts
import { createS3Vectors } from '@vercel/aws';
import { QueryVectorsCommand } from '@aws-sdk/client-s3vectors';

const vectors = createS3Vectors();

const { vectors: matches } = await vectors.send(
  new QueryVectorsCommand({
    vectorBucketName: vectors.vectorBucketName,
    indexName: 'docs',
    queryVector: { float32: embedding },
    topK: 5,
  })
);
```

## S3 Tables

`createS3Tables()` returns an `S3TablesClient` with the connected table bucket attached as `tableBucketName` and `tableBucketARN` (most S3 Tables commands address the bucket by ARN):

```ts
import { createS3Tables } from '@vercel/aws';
import { ListNamespacesCommand } from '@aws-sdk/client-s3tables';

const tables = createS3Tables();

const { namespaces } = await tables.send(
  new ListNamespacesCommand({ tableBucketARN: tables.tableBucketARN })
);
```

## Multiple resources of the same service

Pass `{ prefix }` to choose which resource a factory connects to:

```ts
const uploads = createS3();
const backups = createS3({ prefix: 'STORAGE2' });

const usersDb = createAuroraDSQL({ prefix: 'STORAGE3' });
const analyticsDb = createAuroraDSQL({ prefix: 'STORAGE4' });
```
