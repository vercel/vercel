---
'@vercel/aws': minor
---

Add `createAuroraDSQL()`, `createAuroraPostgreSQL()`, `createDynamoDB()`, `createDynamoDBDocument()`, `createS3()`, `createS3Vectors()`, and `createS3Tables()` for Vercel Marketplace AWS resources.

Each factory finds its resource by the env var only that service injects (`PGHOST`, `DYNAMODB_TABLE_NAME`, `S3_BUCKET_NAME`, `S3_VECTOR_BUCKET_NAME`, `S3_TABLE_BUCKET_NAME`, `OPENSEARCH_ENDPOINT`) alongside a matching `AWS_ROLE_ARN`, under either the unprefixed default connection or any custom prefix. Aurora DSQL and Aurora PostgreSQL are told apart by their `PGHOST` hostname, which also keeps non-AWS Postgres integrations (e.g. Neon) from being mistaken for Aurora. Pass `{ prefix }` to choose between multiple resources of the same service, or explicit fields to bypass env lookup.

`createOpenSearch()` now also supports prefixed connections and `{ prefix }`. The S3, S3 Vectors, S3 Tables, and DynamoDB clients expose their resource name (`bucket`, `vectorBucketName`, `tableBucketName`/`tableBucketARN`, `tableName`) as a property. All AWS SDKs are optional peer dependencies.
