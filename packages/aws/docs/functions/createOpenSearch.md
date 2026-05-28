[**@vercel/aws**](../README.md)

---

# Function: createOpenSearch()

> **createOpenSearch**(`opts?`): `Client`

Defined in: [packages/aws/src/opensearch.ts:50](https://github.com/vercel/vercel/blob/main/packages/aws/src/opensearch.ts#L50)

Creates an OpenSearch `Client` pre-configured for a Vercel Marketplace
OpenSearch resource.

Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
Configuration is resolved from the env vars Vercel injects under the
resource's link prefix.

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
