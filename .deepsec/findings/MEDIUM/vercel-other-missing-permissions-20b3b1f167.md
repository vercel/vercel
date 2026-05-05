# [MEDIUM] Workflow lacks explicit `permissions:` block

**File:** [`.github/workflows/cron-update-next-latest.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-next-latest.yml#L10-L12) (lines 10, 11, 12)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-missing-permissions`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

No `permissions:` key is set at workflow or job level, so the job inherits the repo's default GITHUB_TOKEN permissions. Given this workflow is the most privileged of the cron set (it executes `npx create-next-app@latest`), it should follow least-privilege.

## Recommendation

Declare `permissions: contents: read` at the workflow level. Push and PR creation are handled via the bot token, not the GITHUB_TOKEN.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Sean Massa <EndangeredMassa@gmail.com> (2025-02-10)
