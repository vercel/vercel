# [MEDIUM] Unpinned third-party action references

**File:** [`.github/workflows/cron-update-turbo.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-turbo.yml#L15-L22) (lines 15, 22)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-supply-chain`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

The workflow references `actions/checkout@v4` (L15) and `actions/github-script@v7` (L22) by floating major version tag rather than commit SHA. Although `update-turbo.js` itself uses `pnpm install --lockfile-only` (which does NOT run install scripts) and so this workflow's exposure is lower than the next-latest variant, the action references should still be pinned because `secrets.NPM_TOKEN` and `secrets.VERCEL_CLI_RELEASE_BOT_TOKEN` are set as env vars and would be exfiltrated if the github-script action major tag were ever moved to a malicious commit.

## Recommendation

Pin actions to full commit SHAs and use Dependabot to update them. Add `permissions: contents: read` at the workflow level.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Jeff See <jeffsee.55@gmail.com> (2024-04-15)
- Steven <steven@ceriously.com> (2023-02-24)
