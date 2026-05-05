# [MEDIUM] Workflow lacks explicit `permissions:` block

**File:** [`.github/workflows/cron-update-next-canary.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/cron-update-next-canary.yml#L10-L12) (lines 10, 11, 12)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-missing-permissions`

## Owners

**Suggested assignee:** `mehul.kar@vercel.com` _(via last-committer)_

## Finding

No `permissions:` key is declared at the workflow or job level. The job inherits the repository's default GITHUB_TOKEN permissions, which on older repositories may default to `write-all`. Combined with the bot token being passed to `actions/github-script`, any compromise of the github-script action or the loaded `./utils/update-next.js` would have broad write access.

## Recommendation

Declare an explicit minimal `permissions:` block. For this workflow, `permissions: contents: read` would suffice since PR creation is done via the bot token, not the GITHUB_TOKEN.

## Recent committers (`git log`)

- Mehul Kar <mehul.kar@vercel.com> (2026-04-20)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Austin Merrick <onsclom@onsclom.net> (2025-03-04)
- Sean Massa <EndangeredMassa@gmail.com> (2025-02-10)
