[**@vercel/aws**](../README.md)

---

# Type Alias: S3BucketClient

> **S3BucketClient** = `S3Client` & `object`

Defined in: packages/aws/src/s3.ts:34

An `S3Client` returned by [createS3](../functions/createS3.md), with the connected bucket's
name attached so it can be passed as `Bucket` on each command.

## Type Declaration

### bucket

> `readonly` **bucket**: `string`

The bucket name, from `<prefix>_S3_BUCKET_NAME` or `{ bucket }`.
