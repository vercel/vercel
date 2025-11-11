# CI/CD Redundancies for Main/Master Branch Equivalence

## Overview
This document describes the changes made to ensure that the Vercel deployment configuration and GitHub CI/CD pipelines properly handle both `main` and `master` branches, ensuring that VERCEL MASTER is equivalent to the MAIN repository.

## Problem Statement
The repository uses `main` as the primary branch, but Vercel platform deployments may reference `master` as the production branch. This could lead to inconsistencies in CI/CD pipeline execution and deployment behavior.

## Solution
Added redundant branch references throughout the CI/CD configuration to ensure both `main` and `master` branches trigger the same workflows and deployments.

## Changes Made

### 1. Vercel Configuration (`vercel.json`)
- **Added**: Explicit `git.deploymentEnabled` configuration
- **Purpose**: Ensures both `main` and `master` branches are recognized as production branches by Vercel
- **Configuration**:
  ```json
  "git": {
    "deploymentEnabled": {
      "main": true,
      "master": true
    }
  }
  ```

### 2. GitHub Actions Workflows

#### Release Workflow (`.github/workflows/release.yml`)
- **Changed**: Added `master` to branch triggers
- **Impact**: Release process now triggers on pushes to either `main` or `master`
- **Before**: `branches: [main]`
- **After**: `branches: [main, master]`

#### Deployment Workflows
Updated the following workflows to trigger on both branches:

1. **Datadog Synthetics** (`.github/workflows/datadog-synthetics.yml`)
   - Push and PR triggers now include both `main` and `master`
   
2. **Webpack Build** (`.github/workflows/webpack.yml`)
   - Push and PR triggers now include both `main` and `master`

3. **Faster Template Prebuild** (`.github/workflows/faster-template-prebuild-nextjs.yml`)
   - Push trigger now includes both `main` and `master`

#### Test Workflows
Updated concurrency controls to prevent cancellation of jobs on either production branch:

1. **Test Workflow** (`.github/workflows/test.yml`)
   - **Before**: `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`
   - **After**: `cancel-in-progress: ${{ github.ref != 'refs/heads/main' && github.ref != 'refs/heads/master' }}`
   - **Impact**: Tests on both `main` and `master` will not be auto-cancelled

2. **Lint Workflow** (`.github/workflows/test-lint.yml`)
   - **Concurrency**: Updated to protect both `main` and `master` from cancellation
   - **Changeset Check**: Made base branch dynamic to handle PRs targeting either branch
     - `ref: ${{ github.event.pull_request.base.ref || 'main' }}`
     - `--since=${{ github.event.pull_request.base.ref || 'main' }}`

## Benefits

1. **Branch Flexibility**: The repository can use either `main` or `master` as the production branch without configuration changes
2. **Vercel Platform Compatibility**: Ensures Vercel deployments work correctly regardless of default branch naming
3. **CI/CD Consistency**: All critical workflows trigger on both branches, ensuring equivalent behavior
4. **No Breaking Changes**: Existing `main` branch workflows continue to work exactly as before
5. **Future-Proof**: Supports potential branch naming migrations or parallel branch strategies

## Testing Recommendations

1. **Workflow Triggers**: Verify workflows trigger on pushes to both `main` and `master`
2. **Deployments**: Confirm Vercel deploys from both branches correctly
3. **Concurrency**: Test that jobs on `main` and `master` are not cancelled inappropriately
4. **Changeset Status**: Validate that PR checks work for PRs targeting either branch

## Migration Notes

If migrating from `master` to `main` (or vice versa):
1. The CI/CD pipelines will work on both branches during the transition
2. No workflow changes needed when switching primary branch
3. Vercel will recognize both branches as production branches
4. Team can gradually migrate with zero downtime

## Related Files

- `vercel.json` - Vercel platform configuration
- `.github/workflows/release.yml` - Release automation
- `.github/workflows/test.yml` - Test suite
- `.github/workflows/test-lint.yml` - Linting and changeset checks
- `.github/workflows/datadog-synthetics.yml` - Synthetic monitoring
- `.github/workflows/webpack.yml` - Webpack build verification
- `.github/workflows/faster-template-prebuild-nextjs.yml` - Next.js prebuild

## Patch File

A complete patch file is available at `/tmp/ci-cd-redundancies.patch` for review and application to other repositories.
