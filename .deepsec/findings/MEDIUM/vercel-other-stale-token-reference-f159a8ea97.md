# [MEDIUM] Workflow references a deleted secret per inline TODO

**File:** [`.github/workflows/cron-update-gatsby-fixtures.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-gatsby-fixtures.yml#L27-L31) (lines 27, 28, 31)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-stale-token-reference`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

Lines 28 and 31 both pass `secrets.VERCEL_CLI_RELEASE_BOT_TOKEN` and the inline comment states `TODO: this secret is deleted, replace with a new bot token or GitHub App`. While not strictly a security vulnerability, this combination is a maintenance/security risk: (1) the workflow may silently fail on schedule (causing fixtures to drift); (2) if a maintainer later re-adds a secret with the same name without verifying its scope, the token may have broader permissions than intended; (3) an empty token still gets resolved to an empty string, so `github-token: ''` may cause the action to fall back to the default GITHUB_TOKEN, which lacks expected push permissions. Also, `secrets.NPM_TOKEN` is exported as `NODE_AUTH_TOKEN` (line 27) which is consumed by setup-node only when a registry is configured — the value is currently being injected into `actions/github-script` env where it is not needed and risks unnecessary exposure to a generic JS step.

## Recommendation

Either remove the workflow if no longer needed, or replace the deleted secret reference and audit which secrets are actually required by `update-gatsby-fixtures.js`. Remove `NODE_AUTH_TOKEN` from the github-script step env if not needed for that script's logic.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Ali Smesseim <ali.smesseim@vercel.com> (2025-09-02)
- Trek Glowacki <trek.glowacki@vercel.com> (2025-02-03)
- Jeff See <jeffsee.55@gmail.com> (2024-04-15)
