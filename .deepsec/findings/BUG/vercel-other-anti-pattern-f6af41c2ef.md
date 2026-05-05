# [BUG] Direct `${{ }}` interpolation of `github.event.discussion.number` in shell command

**File:** [`.github/workflows/discussions-auto-close.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/discussions-auto-close.yml#L40) (lines 40)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-anti-pattern`

## Owners

**Suggested assignee:** `jacob@jacobparis.com` _(via last-committer)_

## Finding

Line 40 interpolates `${{ github.event.discussion.number }}` directly into a shell command rather than passing it via environment variable. While `discussion.number` is typed as a non-null integer in GitHub's GraphQL schema and therefore cannot currently contain shell metacharacters, this is the same anti-pattern that has caused numerous GitHub Actions script injection CVEs. The neighboring `DISCUSSION_ID` is correctly passed via env var (L43), making this inconsistent. If GitHub ever changed the type or if a similar copy-paste was made for a string-typed field (like `discussion.title` or `discussion.body`), it would become a script injection vulnerability.

## Recommendation

Pass `github.event.discussion.number` through an environment variable like `DISCUSSION_NUMBER` (alongside the existing `DISCUSSION_ID`) and reference `$DISCUSSION_NUMBER` in the shell command. This eliminates the anti-pattern and prevents future foot-guns when modifying the workflow.

## Recent committers (`git log`)

- Jacob Paris <jacob@jacobparis.com> (2025-04-11)
- Trek Glowacki <trek.glowacki@vercel.com> (2024-12-09)
