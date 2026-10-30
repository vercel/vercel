# @vercel/aws

## 0.2.23

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.16

## 0.2.22

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.15

## 0.2.21

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.14

## 0.2.20

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.13

## 0.2.19

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.12

## 0.2.18

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.11

## 0.2.17

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.10

## 0.2.16

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.9

## 0.2.15

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.8

## 0.2.14

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.7

## 0.2.13

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.6

## 0.2.12

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.5

## 0.2.11

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.4

## 0.2.10

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.3

## 0.2.9

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.
- Updated dependencies [6d7fbfa]
  - @vercel/oidc-aws-credentials-provider@3.3.2

## 0.2.8

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.3.1

## 0.2.7

### Patch Changes

- Updated dependencies [d29a8f9]
  - @vercel/oidc-aws-credentials-provider@3.3.0

## 0.2.6

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.2.1

## 0.2.5

### Patch Changes

- Updated dependencies [415fde0]
  - @vercel/oidc-aws-credentials-provider@3.2.0

## 0.2.4

### Patch Changes

- @vercel/oidc-aws-credentials-provider@3.1.5

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
