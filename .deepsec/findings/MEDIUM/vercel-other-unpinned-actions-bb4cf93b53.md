# [MEDIUM] Third-party actions referenced by major-version tag rather than commit SHA

**File:** [`.github/workflows/cron-update-gatsby-fixtures.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-gatsby-fixtures.yml#L15-L25) (lines 15, 19, 25)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-unpinned-actions`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

Lines 15 (`actions/checkout@v4`), 19 (`actions/setup-node@v4`), and 25 (`actions/github-script@v7`) use floating major-version tags. While these are GitHub-owned actions and generally trusted, the project's `ci-doctor.lock.yml` and `agentics-maintenance.yml` pin to commit SHAs (e.g., `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd`) which is the recommended hardening per OpenSSF Scorecard. Inconsistency means the `cron` workflow runs with the GH App / bot token (highly privileged) without the same supply-chain hardening as other workflows.

## Recommendation

Pin all action references to specific commit SHAs with the version tag in a comment, consistent with the rest of the workflows in this repo.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Ali Smesseim <ali.smesseim@vercel.com> (2025-09-02)
- Trek Glowacki <trek.glowacki@vercel.com> (2025-02-03)
- Jeff See <jeffsee.55@gmail.com> (2024-04-15)
