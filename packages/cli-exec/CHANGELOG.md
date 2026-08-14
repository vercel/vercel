# @vercel/cli-exec

## 1.0.0

### Major Changes

- 3f21605: Improve project-local `vercel` binary lookup fidelity by resolving only through the local `vercel` package, stopping lookup at project boundaries, and skipping directories that have unsafe ownership or access mode. Major bump, because `findVercelCli` has been made async and `clearVercelCliCache` renamed to `clearVercelCliLookupCache`. It is also substantially a complete rewrite.

## 0.1.1

### Patch Changes

- 82edff0: Bump only

## 0.1.0

### Minor Changes

- 4873263: Add a reusable CLI wrapper package for resolving and executing the local Vercel CLI.
