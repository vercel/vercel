[**@vercel/aws**](../README.md)

---

# Function: createS3()

> **createS3**(`opts?`): [`S3BucketClient`](../type-aliases/S3BucketClient.md)

Defined in: packages/aws/src/s3.ts:56

Creates an `S3Client` pre-configured for a Vercel Marketplace S3 bucket.

Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
The bucket name is exposed as `client.bucket`.

## Parameters

### opts?

[`CreateS3Options`](../interfaces/CreateS3Options.md) = `{}`

## Returns

[`S3BucketClient`](../type-aliases/S3BucketClient.md)

## Example

```ts
import { createS3 } from '@vercel/aws';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = createS3();
const object = await s3.send(
  new GetObjectCommand({ Bucket: s3.bucket, Key: 'hello.txt' })
);
```
