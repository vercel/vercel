# [MEDIUM] `npm install -g vercel@latest` and unpinned actions

**File:** [`.github/workflows/faster-template-prebuild-nextjs.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/faster-template-prebuild-nextjs.yml#L14-L27) (lines 14, 18, 27)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-supply-chain`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

L27 executes `npm install -g vercel@latest`, pulling whatever happens to be the latest published `vercel` package at runtime. Although `vercel` is published by the same org as this repo, the workflow is on a `push: main` trigger and exposes `NOW_EXAMPLES_VERCEL_TOKEN` (L41, L49) and `NOW_EXAMPLES_VERCEL_ORG_ID` directly to the installed binary. If the npm package is ever compromised (account takeover, dependency confusion, malicious release published before detection), all subsequent runs exfiltrate those secrets. `actions/checkout@v4` (L14) and `actions/setup-node@v4` (L18) are also pinned only to major versions.

## Recommendation

Pin `vercel` to an exact version (e.g., `npm install -g vercel@X.Y.Z`) and bump it deliberately. Pin actions to commit SHAs.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Trek Glowacki <trek.glowacki@vercel.com> (2024-12-09)
