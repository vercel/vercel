# [MEDIUM] Workflow lacks explicit `permissions:` block

**File:** [`.github/workflows/cron-update-turbo.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-turbo.yml#L10-L12) (lines 10, 11, 12)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-missing-permissions`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

No `permissions:` directive — the job inherits the repository's default GITHUB_TOKEN permissions. While the script uses the bot token for the GitHub API operations, an explicit minimal scope is recommended.

## Recommendation

Declare `permissions: contents: read` at the workflow level.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Jeff See <jeffsee.55@gmail.com> (2024-04-15)
- Steven <steven@ceriously.com> (2023-02-24)
