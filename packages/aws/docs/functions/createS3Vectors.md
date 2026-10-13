[**@vercel/aws**](../README.md)

---

# Function: createS3Vectors()

> **createS3Vectors**(`opts?`): [`S3VectorBucketClient`](../type-aliases/S3VectorBucketClient.md)

Defined in: packages/aws/src/s3-vectors.ts:69

Creates an `S3VectorsClient` pre-configured for a Vercel Marketplace
S3 vector bucket.

Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
The vector bucket name is exposed as `client.vectorBucketName`.

## Parameters

### opts?

[`CreateS3VectorsOptions`](../interfaces/CreateS3VectorsOptions.md) = `{}`

## Returns

[`S3VectorBucketClient`](../type-aliases/S3VectorBucketClient.md)

## Example

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
