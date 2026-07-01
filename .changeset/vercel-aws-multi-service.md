---
'@vercel/aws': minor
---

Add `createAuroraDSQL()`, `createAuroraPostgreSQL()`, `createDynamoDB()`, and `createDynamoDBDocument()` for Vercel Marketplace AWS resources, and fix `createOpenSearch()` to read the prefix-based env vars the Marketplace integrations actually inject (`<PREFIX>_AWS_RESOURCE_TYPE`, `<PREFIX>_OPENSEARCH_ENDPOINT`, `<PREFIX>_AWS_REGION`, `<PREFIX>_AWS_ROLE_ARN`, etc.).

Each factory autodetects the env var prefix by scanning for a `*_AWS_RESOURCE_TYPE` matching the service (`opensearch`, `dsql`, `rds`, `dynamodb`), so the common single-resource case requires no arguments. Pass `{ prefix }` to disambiguate when multiple resources of the same service are connected, or pass explicit fields (`hostname`, `region`, `roleArn`, etc.) to bypass env lookup entirely.

All AWS SDKs are declared as optional peer dependencies — install only the ones you need.
