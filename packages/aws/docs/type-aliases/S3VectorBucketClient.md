[**@vercel/aws**](../README.md)

---

# Type Alias: S3VectorBucketClient

> **S3VectorBucketClient** = `S3VectorsClient` & `object`

Defined in: packages/aws/src/s3-vectors.ts:38

An `S3VectorsClient` returned by [createS3Vectors](../functions/createS3Vectors.md), with the
connected vector bucket's name attached so it can be passed as
`vectorBucketName` on each command.

## Type Declaration

### vectorBucketName

> `readonly` **vectorBucketName**: `string`

The vector bucket name, from `<prefix>_S3_VECTOR_BUCKET_NAME` or
`{ vectorBucketName }`.
