[**@vercel/aws**](../README.md)

---

# Function: createS3Tables()

> **createS3Tables**(`opts?`): [`S3TableBucketClient`](../type-aliases/S3TableBucketClient.md)

Defined in: packages/aws/src/s3-tables.ts:74

Creates an `S3TablesClient` pre-configured for a Vercel Marketplace
S3 table bucket.

Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
The table bucket is exposed as `client.tableBucketName` and
`client.tableBucketARN`.

## Parameters

### opts?

[`CreateS3TablesOptions`](../interfaces/CreateS3TablesOptions.md) = `{}`

## Returns

[`S3TableBucketClient`](../type-aliases/S3TableBucketClient.md)

## Example

```ts
import { createS3Tables } from '@vercel/aws';
import { ListNamespacesCommand } from '@aws-sdk/client-s3tables';

const tables = createS3Tables();
const { namespaces } = await tables.send(
  new ListNamespacesCommand({ tableBucketARN: tables.tableBucketARN })
);
```
