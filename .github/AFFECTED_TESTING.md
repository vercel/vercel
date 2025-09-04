# Affected Testing Strategy

This repository implements an affected testing strategy, which runs tests only on packages that have been changed or are affected by changes.

## How It Works

1. **Git Change Detection**: Uses turborepos's GraphQL query API to detect which packages have been modified since a base commit
2. **Affected Package Resolution**: Finds packages that:
   - Have direct file changes
   - Depend on packages that have changed
   - Have test-related tasks (test, vitest, type-check)
3. **E2E Tests**: Analyzes changed files to determine when to run all e2e tests:
   - Infrastructure changes (CI workflows, turbo.json, root package.json) trigger all e2e tests
   - Build utility changes trigger all e2e tests
   - Package-specific changes only trigger affected package e2e tests
4. **Selective Testing**: Only runs tests for affected packages using turbo's `--filter` functionality

## Key Files

- `utils/affected-query.gql` - GraphQL query for turbo to find affected packages
- `utils/get-affected-packages.js` - Script that queries turbo and filters affected packages
- `utils/chunk-tests.js` - Updated to use affected package detection
- `utils/test-affected.js` - Local testing script to preview affected packages
- `.github/workflows/test.yml` - Updated CI workflow

## Local Testing

To test the affected package detection locally:

```bash
# Test against a specific commit
node utils/test-affected.js main

# Test against current environment
TURBO_BASE_SHA=main node utils/test-affected.js
```

## CI Behavior

### Pull Requests

- Compares against the PR base branch to find affected packages
- Only runs tests for packages that have been modified or depend on modified packages
- Significantly reduces CI time for targeted changes

### Main Branch / Full Runs

- When no base SHA is available, falls back to testing all packages
- Ensures comprehensive testing when needed

## Environment Variables

- `TURBO_BASE_SHA`: Base commit SHA to compare changes against
- `GITHUB_BASE_REF`: Fallback for GitHub Actions environment

## E2E Test Handling

The system has special logic for e2e tests since they often test cross-package integration:

### Infrastructure Files That Trigger All E2E Tests

- `.github/workflows/` - CI workflow changes
- `turbo.json` - Turbo configuration changes
- `package.json` - Root dependency changes
- `pnpm-lock.yaml` - Lock file changes
- `utils/*.js` - Build/test utility changes
- `test/lib/` - Shared test utilities
- `packages/cli/scripts/start.js` - CLI entry point
- `packages/build-utils/src/` - Build utilities affecting all builders

## Implementation Details

The affected testing works by:

1. Using turbo's GraphQL API to query for packages affected by changes since the base commit
2. Filtering packages that have test-related tasks
3. Analyzing changed files for infrastructure changes that affect e2e tests globally
4. Generating turbo filters like `--filter=package-name...` (the `...` includes dependents)
5. Passing these filters to turbo commands to limit scope

This approach ensures that:

- If package A changes, package A and packages that depend on A are tested
- If infrastructure changes, all e2e tests run to catch integration issues
- Unit tests still only run for directly affected packages
