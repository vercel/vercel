[**@vercel/aws**](../README.md)

---

# Function: createOpenSearch()

> **createOpenSearch**(`opts?`): `Client`

Defined in: [packages/aws/src/opensearch.ts:49](https://github.com/vercel/vercel/blob/main/packages/aws/src/opensearch.ts#L49)

Creates an OpenSearch `Client` pre-configured for a Vercel
Marketplace OpenSearch Serverless resource.

Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
The role, region, and endpoint default to env vars Vercel injects
automatically when the project is connected to an OpenSearch resource.

## Parameters

### opts?

[`CreateOpenSearchOptions`](../interfaces/CreateOpenSearchOptions.md) = `{}`

## Returns

`Client`

## Example

```ts
import { createOpenSearch } from '@vercel/aws';

const os = createOpenSearch();
await os.search({ index: 'my-index', body: { query: { match_all: {} } } });
```
