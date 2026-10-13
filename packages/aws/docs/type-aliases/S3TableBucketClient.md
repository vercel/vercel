[**@vercel/aws**](../README.md)

---

# Type Alias: S3TableBucketClient

> **S3TableBucketClient** = `S3TablesClient` & `object`

Defined in: packages/aws/src/s3-tables.ts:45

An `S3TablesClient` returned by [createS3Tables](../functions/createS3Tables.md), with the connected
table bucket's name and ARN attached. Most S3 Tables commands address the
bucket by `tableBucketARN`.

## Type Declaration

### tableBucketARN

> `readonly` **tableBucketARN**: `string`

The table bucket ARN.

### tableBucketName

> `readonly` **tableBucketName**: `string`

The table bucket name, from `<prefix>_S3_TABLE_BUCKET_NAME` or
`{ tableBucketName }`.
