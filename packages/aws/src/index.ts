export type { CreateOpenSearchOptions } from './opensearch';
export { createOpenSearch } from './opensearch';
export type { CreateAuroraDSQLOptions } from './aurora-dsql';
export { createAuroraDSQL } from './aurora-dsql';
export type { CreateAuroraPostgreSQLOptions } from './aurora-postgresql';
export { createAuroraPostgreSQL } from './aurora-postgresql';
export type {
  CreateDynamoDBOptions,
  CreateDynamoDBDocumentOptions,
  DynamoDBTableClient,
  DynamoDBDocumentTableClient,
} from './dynamodb';
export { createDynamoDB, createDynamoDBDocument } from './dynamodb';
export type { CreateS3Options, S3BucketClient } from './s3';
export { createS3 } from './s3';
export type {
  CreateS3VectorsOptions,
  S3VectorBucketClient,
} from './s3-vectors';
export { createS3Vectors } from './s3-vectors';
export type { CreateS3TablesOptions, S3TableBucketClient } from './s3-tables';
export { createS3Tables } from './s3-tables';
