# @vercel/aws

## 0.2.3

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.1.4

## 0.2.2

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.1.3

## 0.2.1

### Patch Changes

- cb11ee2: Update `createOpenSearch` to read `OPENSEARCH_ENDPOINT` and `AWS_REGION` (replacing `OPENSEARCH_DASHBOARD_ENDPOINT` and `OPENSEARCH_REGION`).

## 0.2.0

### Minor Changes

- 11e2a41: Introduce `@vercel/aws` with `createOpenSearch()`, a one-line factory that wires up an `@opensearch-project/opensearch` client using the env vars Vercel injects for a Marketplace OpenSearch Serverless resource. Credentials are resolved via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`, so no static keys are required.
