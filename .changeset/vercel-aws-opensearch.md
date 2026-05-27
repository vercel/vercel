---
'@vercel/aws': minor
---

Introduce `@vercel/aws` with `createOpenSearch()`, a one-line factory that wires up an `@opensearch-project/opensearch` client using the env vars Vercel injects for a Marketplace OpenSearch Serverless resource. Credentials are resolved via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`, so no static keys are required.
