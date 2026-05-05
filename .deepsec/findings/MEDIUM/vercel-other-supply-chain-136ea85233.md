# [MEDIUM] Unpinned third-party action references

**File:** [`.github/workflows/cron-update-next-latest.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-next-latest.yml#L15-L22) (lines 15, 22)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-supply-chain`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

The workflow references `actions/checkout@v4` (L15) and `actions/github-script@v7` (L22) by floating major version tag rather than commit SHA. While these actions come from GitHub's `actions` org, pinning to commit SHA is the recommended hardening practice for workflows holding release-capable secrets.

## Recommendation

Pin actions to full commit SHAs (e.g., `actions/checkout@<sha> # v4.x.y`) and use Dependabot to keep them updated.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Sean Massa <EndangeredMassa@gmail.com> (2025-02-10)
