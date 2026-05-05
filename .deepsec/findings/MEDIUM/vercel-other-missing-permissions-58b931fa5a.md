# [MEDIUM] Workflow lacks explicit `permissions:` block

**File:** [`.github/workflows/discussions-auto-close.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/discussions-auto-close.yml#L9-L11) (lines 9, 10, 11)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-missing-permissions`

## Owners

**Suggested assignee:** `jacob@jacobparis.com` _(via last-committer)_

## Finding

The workflow does not declare a `permissions:` block, so it inherits the repository's default GITHUB_TOKEN permissions. The `discussion.created` trigger fires for any user-created discussion, including those by external/anonymous users. While the only intended behavior is to lock and comment on the discussion, an overly broad default token (e.g., `write-all`) would mean any future code change to this workflow that introduces a script-injection sink could grant attackers far more than just discussion-write capability.

## Recommendation

Add an explicit minimal `permissions:` block. For this workflow, `permissions: discussions: write` is sufficient.

## Recent committers (`git log`)

- Jacob Paris <jacob@jacobparis.com> (2025-04-11)
- Trek Glowacki <trek.glowacki@vercel.com> (2024-12-09)
