# [MEDIUM] GITHUB_OUTPUT injection via PR title written without heredoc

**File:** [`.github/workflows/comment-cli-tarball.yml`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/.github/workflows/comment-cli-tarball.yml#L27-L30) (lines 27, 28, 29, 30)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-github-output-injection`

## Owners

**Suggested assignee:** `cody.wong@vercel.com` _(via last-committer)_

## Finding

Line 30: `echo "prTitle=$PR_TITLE" >> $GITHUB_OUTPUT` where `PR_TITLE` is parsed from the GitHub API response. While GitHub PR titles are normally single-line, the API technically accepts (and stores via certain code paths) values containing CR/LF. A title containing a newline followed by `prTitle=Version Packages` would set the consumed output to `Version Packages`, causing all subsequent steps gated by `if: steps.pr-context.outputs.prTitle != 'Version Packages'` (lines 33, 38, 46) to be skipped — an attacker who lands a PR with a crafted title can deny the comment. More generally, multi-line interpolation into `$GITHUB_OUTPUT` without heredoc syntax (`KEY<<EOF` ... `EOF`) can also inject additional output keys consumed by later steps.

## Recommendation

Use the `EOF`-delimited heredoc form for any value that may contain newlines: `{ echo 'prTitle<<EOF'; echo "$PR_TITLE"; echo 'EOF'; } >> "$GITHUB_OUTPUT"`. Same for `prNumber` for defense in depth. Also quote `$GITHUB_OUTPUT` consistently.

## Recent committers (`git log`)

- Cody Wong <cody.wong@vercel.com> (2026-04-23)
- Michael J. Sullivan <sully@msully.net> (2026-03-02)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-02-24)
- Elvis Pranskevichus <elvis@vercel.com> (2026-02-13)
- Marcos Grappeggia <marcosgrappeggia@gmail.com> (2026-02-12)
