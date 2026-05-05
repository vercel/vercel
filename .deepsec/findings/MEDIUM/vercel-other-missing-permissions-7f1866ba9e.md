# [MEDIUM] Workflow lacks explicit `permissions:` block

**File:** [`.github/workflows/faster-template-prebuild-nextjs.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/faster-template-prebuild-nextjs.yml#L10-L12) (lines 10, 11, 12)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-missing-permissions`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

No `permissions:` directive at workflow or job level. Since this workflow runs on `push: main` with secrets including `VERCEL_CLI_RELEASE_BOT_TOKEN`, NOW_EXAMPLES_VERCEL_TOKEN, and uses the bot token for checkout, default GITHUB_TOKEN scope should be minimized.

## Recommendation

Add `permissions: contents: read` at the workflow level (the workflow does not need to write back to the repo via GITHUB_TOKEN).

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Trek Glowacki <trek.glowacki@vercel.com> (2024-12-09)
