# @vercel/aws

Pre-configured AWS service clients for [Vercel Marketplace](https://vercel.com/marketplace) resources.

Credentials are resolved automatically via [Vercel OIDC](https://vercel.com/docs/security/secure-backend-access/oidc) — no static access keys required.

## Install

```sh
pnpm add @vercel/aws @opensearch-project/opensearch
```

## OpenSearch

After installing the [Amazon OpenSearch Serverless](https://vercel.com/marketplace/amazon-opensearch-serverless) integration and connecting it to a project, Vercel injects the configuration as environment variables. `createOpenSearch()` reads them automatically:

```ts
import { createOpenSearch } from '@vercel/aws';

const os = createOpenSearch();

const results = await os.search({
  index: 'docs',
  body: { query: { match: { title: 'vercel' } } },
});
```

You can override any field explicitly — useful for local development or for connecting to a second collection:

```ts
const os = createOpenSearch({
  endpoint: process.env.MY_OTHER_OPENSEARCH_ENDPOINT,
  region: 'us-east-2',
  roleArn: process.env.MY_OTHER_ROLE_ARN,
});
```
