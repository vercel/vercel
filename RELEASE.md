# CLI Release Runbook

This runbook covers how stable `vercel` CLI releases are published from this repository.

## TL;DR

1. Merge normal PRs with changesets into `main`.
2. Wait for the `Release` workflow to open/update the `Version Packages` PR.
3. Have an admin **force merge** that PR even if required checks look stuck.
4. Merging triggers `Release` on `main` again, which publishes the release.

## Why the release PR looks "hung"

The release PR is created by `changesets/action` in `.github/workflows/release.yml` using `GITHUB_TOKEN`.

For this repo, that `Version Packages` PR is intentionally treated as a fast handoff PR:

- PR CI is not expected to run for this bot-generated PR.
- Rulesets can still require checks like `Summary`, `Summary (lint)`, and `Summary (python-packages)`.
- Those checks may remain in an expected/pending state indefinitely for this PR.

This is expected and intentional. We do **not** wait for CI here because the merge to `main` immediately triggers the real release workflow.

## Preconditions

Before triggering a release:

- Changesets for the intended changes are already merged into `main`.
- The `Release` workflow on `main` is healthy.
- An admin with branch/ruleset bypass permissions is available to merge the release PR.

## Stable CLI release process

### 1) Wait for the release PR

After changesets land on `main`, GitHub Actions `Release` (`.github/workflows/release.yml`) will run and create or update a PR titled:

- `Version Packages`

### 2) Validate the PR contents

Review the diff and confirm it only contains expected release-generated changes, such as:

- `package.json` version updates
- package changelog updates
- lockfile/version sync updates (for example `pnpm-lock.yaml`, `uv.lock`, Python package versions)

If the PR includes unexpected file changes, stop and investigate before merging.

### 3) Merge with admin bypass (force merge)

An admin should merge the `Version Packages` PR using bypass/force-merge permissions.

- Do not wait for required checks that are not running.
- This is the intended path for release PRs in this repository.

### 4) Confirm publish run on `main`

Merging the PR pushes to `main`, which triggers `Release` again.

In that run, `changesets/action` executes:

- `pnpm ci:version`
- `pnpm ci:publish`

If there are publishable changes, this publishes packages (including `vercel`) and creates tags.

## Post-release verification

After `Release` succeeds:

- Confirm package version on npm:
  - `npm view vercel version`
- Confirm dist-tags:
  - `npm dist-tag ls vercel`
- Optionally verify git tags created by changesets.

## Rollback / hotfix

If `latest` points to the wrong version, run:

- Workflow: `Rollback Latest Tag` (`.github/workflows/rollback-latest-tag.yml`)
- Input: desired stable version (for example `39.2.4`)

This updates npm dist-tag `latest` without republishing.

## Related workflows

- Stable release: `.github/workflows/release.yml`
- Canary publish: `.github/workflows/canary.yml`
- Python package manual publish: `.github/workflows/release-python-package.yml`
- Rust crate publish: `.github/workflows/release-crates.yml`
- NPM latest rollback: `.github/workflows/rollback-latest-tag.yml`

## Common failure modes

- `Version Packages` PR does not appear:
  - Check latest `Release` run on `main` for failures before `changesets/action`.
- `Version Packages` PR checks appear stuck:
  - Expected for this flow; admin bypass merge is required.
- Release run on `main` fails after merge:
  - Fix failure on `main`, then re-run `Release` workflow or land the required fix and allow next run to publish.
# CLI Release Runbook

This runbook covers how stable `vercel` CLI releases are published from this repository.

## TL;DR

1. Merge normal PRs with changesets into `main`.
2. Wait for the `Release` workflow to open/update the `Version Packages` PR.
3. Have an admin **force merge** that PR even if required checks look stuck.
4. Merging triggers `Release` on `main` again, which publishes the release.

## Why the release PR looks "hung"

The release PR is created by `changesets/action` in `.github/workflows/release.yml` using `GITHUB_TOKEN`.

For this repo, that `Version Packages` PR is intentionally treated as a fast handoff PR:

- PR CI is not expected to run for this bot-generated PR.
- Rulesets can still require checks like `Summary`, `Summary (lint)`, and `Summary (python-packages)`.
- Those checks may remain in an expected/pending state indefinitely for this PR.

This is expected and intentional. We do **not** wait for CI here because the merge to `main` immediately triggers the real release workflow.

## Preconditions

Before triggering a release:

- Changesets for the intended changes are already merged into `main`.
- The `Release` workflow on `main` is healthy.
- An admin with branch/ruleset bypass permissions is available to merge the release PR.

## Stable CLI release process

### 1) Wait for the release PR

After changesets land on `main`, GitHub Actions `Release` (`.github/workflows/release.yml`) will run and create or update a PR titled:

- `Version Packages`

### 2) Validate the PR contents

Review the diff and confirm it only contains expected release-generated changes, such as:

- `package.json` version updates
- package changelog updates
- lockfile/version sync updates (for example `pnpm-lock.yaml`, `uv.lock`, Python package versions)

If the PR includes unexpected file changes, stop and investigate before merging.

### 3) Merge with admin bypass (force merge)

An admin should merge the `Version Packages` PR using bypass/force-merge permissions.

- Do not wait for required checks that are not running.
- This is the intended path for release PRs in this repository.

### 4) Confirm publish run on `main`

Merging the PR pushes to `main`, which triggers `Release` again.

In that run, `changesets/action` executes:

- `pnpm ci:version`
- `pnpm ci:publish`

If there are publishable changes, this publishes packages (including `vercel`) and creates tags.

## Post-release verification

After `Release` succeeds:

- Confirm package version on npm:
  - `npm view vercel version`
- Confirm dist-tags:
  - `npm dist-tag ls vercel`
- Optionally verify git tags created by changesets.

## Rollback / hotfix

If `latest` points to the wrong version, run:

- Workflow: `Rollback Latest Tag` (`.github/workflows/rollback-latest-tag.yml`)
- Input: desired stable version (for example `39.2.4`)

This updates npm dist-tag `latest` without republishing.

## Related workflows

- Stable release: `.github/workflows/release.yml`
- Canary publish: `.github/workflows/canary.yml`
- Python package manual publish: `.github/workflows/release-python-package.yml`
- Rust crate publish: `.github/workflows/release-crates.yml`
- NPM latest rollback: `.github/workflows/rollback-latest-tag.yml`

## Common failure modes

- `Version Packages` PR does not appear:
  - Check latest `Release` run on `main` for failures before `changesets/action`.
- `Version Packages` PR checks appear stuck:
  - Expected for this flow; admin bypass merge is required.
- Release run on `main` fails after merge:
  - Fix failure on `main`, then re-run `Release` workflow or land the required fix and allow next run to publish.
# CLI Release Runbook

This runbook covers how stable `vercel` CLI releases are published from this repository.

## TL;DR

1. Merge normal PRs with changesets into `main`.
2. Wait for the `Release` workflow to open/update the `Version Packages` PR.
3. Have an admin **force merge** that PR even if required checks look stuck.
4. Merging triggers `Release` on `main` again, which publishes the release.

## Why the release PR looks "hung"

The release PR is created by `changesets/action` in `.github/workflows/release.yml` using `GITHUB_TOKEN`.

For this repo, that `Version Packages` PR is intentionally treated as a fast handoff PR:

- PR CI is not expected to run for this bot-generated PR.
- Rulesets can still require checks like `Summary`, `Summary (lint)`, and `Summary (python-packages)`.
- Those checks may remain in an expected/pending state indefinitely for this PR.

This is expected and intentional. We do **not** wait for CI here because the merge to `main` immediately triggers the real release workflow.

## Preconditions

Before triggering a release:

- Changesets for the intended changes are already merged into `main`.
- The `Release` workflow on `main` is healthy.
- An admin with branch/ruleset bypass permissions is available to merge the release PR.

## Stable CLI release process

### 1) Wait for the release PR

After changesets land on `main`, GitHub Actions `Release` (`.github/workflows/release.yml`) will run and create or update a PR titled:

- `Version Packages`

### 2) Validate the PR contents

Review the diff and confirm it only contains expected release-generated changes, such as:

- `package.json` version updates
- package changelog updates
- lockfile/version sync updates (for example `pnpm-lock.yaml`, `uv.lock`, Python package versions)

If the PR includes unexpected file changes, stop and investigate before merging.

### 3) Merge with admin bypass (force merge)

An admin should merge the `Version Packages` PR using bypass/force-merge permissions.

- Do not wait for required checks that are not running.
- This is the intended path for release PRs in this repository.

### 4) Confirm publish run on `main`

Merging the PR pushes to `main`, which triggers `Release` again.

In that run, `changesets/action` executes:

- `pnpm ci:version`
- `pnpm ci:publish`

If there are publishable changes, this publishes packages (including `vercel`) and creates tags.

## Post-release verification

After `Release` succeeds:

- Confirm package version on npm:
  - `npm view vercel version`
- Confirm dist-tags:
  - `npm dist-tag ls vercel`
- Optionally verify git tags created by changesets.

## Rollback / hotfix

If `latest` points to the wrong version, run:

- Workflow: `Rollback Latest Tag` (`.github/workflows/rollback-latest-tag.yml`)
- Input: desired stable version (for example `39.2.4`)

This updates npm dist-tag `latest` without republishing.

## Related workflows

- Stable release: `.github/workflows/release.yml`
- Canary publish: `.github/workflows/canary.yml`
- Python package manual publish: `.github/workflows/release-python-package.yml`
- Rust crate publish: `.github/workflows/release-crates.yml`
- NPM latest rollback: `.github/workflows/rollback-latest-tag.yml`

## Common failure modes

- `Version Packages` PR does not appear:
  - Check latest `Release` run on `main` for failures before `changesets/action`.
- `Version Packages` PR checks appear stuck:
  - Expected for this flow; admin bypass merge is required.
- Release run on `main` fails after merge:
  - Fix failure on `main`, then re-run `Release` workflow or land the required fix and allow next run to publish.
